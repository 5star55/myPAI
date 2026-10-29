/**
 * autoMemory.ts — remembers lasting facts the user mentions, without being asked
 * ("I'm 19", "my sister is called Ada", "I prefer short answers"), and drops ones
 * that a new message makes out of date (a new age replaces the old one).
 *
 * A cheap check on the message decides whether it could hold such a fact; only then
 * the small model reads it (with what is already saved) and answers in JSON.
 * It runs alongside the reply, so it adds no waiting.
 */
import type { ChatTurn } from '@shared/ipc'
import { isSmallTalk } from '@shared/intent'
import { complete } from '../model'
import { addMemory, deleteMemory, listMemory } from '../store/memory'

/** Words people use when they share something about themselves (or ask to be remembered). */
const PERSONAL =
  /\b(i am|i'?m|im|i was|i'?ve|i have|i live|i work|i study|i like|i love|i hate|i prefer|i don'?t like|i usually|my|mine|call me|remember|don'?t forget|keep in mind|note that|store|memori[sz]e)\b/i

/** Questions often come without a "?" ("what is my birthday"). */
const QUESTION = /^\s*(what|what'?s|whats|how|who|when|where|why|which|is|are|am|do|does|did|can|could|would|should|tell me|remind me what)\b/i
/** Requests ("help me plan my day", "make my CV") aren't facts. "Remember that…" stays a fact. */
const REQUEST =
  /^\s*(please\s+)?(help|plan|make|create|write|give|show|find|search|look|tell|explain|summari[sz]e|open|run|build|fix|set|send|read|check|translate|quiz|teach|organi[sz]e|delete|move|rename|list|draft)\b/i

const MAX_NEW = 3
const MAX_FACT_CHARS = 200

/** Could this message tell us something lasting about the user? (Questions and small talk can't.) */
export function mightHoldFact(text: string): boolean {
  const t = text.trim()
  return t.length >= 6 && t.length <= 2000 && PERSONAL.test(t) && !isSmallTalk(t) && !/\?\s*$/.test(t) && !QUESTION.test(t) && !REQUEST.test(t)
}

const INSTRUCTIONS = [
  "You keep a list of lasting facts about the user for their personal assistant. Read the user's latest message.",
  'Answer with ONLY this JSON: {"add": ["..."], "remove": [numbers]}',
  '- add: new lasting facts the user states about themselves or their life: name, age, birthday, family and friends, where they live, school or job, preferences, routines, goals, important numbers. One short sentence each, starting with "User", e.g. "User is 19 years old." Keep their exact details.',
  '- Also add anything the user explicitly asks you to remember.',
  '- remove: the numbers of saved facts that the new message makes out of date or wrong (e.g. a new age replaces an old age).',
  '- Never add: questions, requests, temporary things (mood today, the current task), facts about the assistant or the conversation, or guesses.',
  '- Nothing to change: {"add": [], "remove": []}'
].join('\n')

export interface MemoryChanges {
  added: string[]
  removed: string[]
}

/** What the latest message would change: facts to add, saved items (by id) to drop. */
export interface MemoryProposal {
  add: string[]
  removeIds: string[]
}

/** Read the latest message and propose memory changes (nothing is saved yet). Never throws. */
export async function proposeMemory(history: ChatTurn[], signal: AbortSignal): Promise<MemoryProposal> {
  const none: MemoryProposal = { add: [], removeIds: [] }
  const last = history.at(-1)
  if (!last || last.role !== 'user') return none
  const saved = listMemory()
  const before = history.at(-2)
  const res = await complete({
    size: 'small',
    temperature: 0,
    maxTokens: 300,
    signal,
    messages: [
      { role: 'system', content: INSTRUCTIONS },
      {
        role: 'user',
        content: [
          `Saved facts:\n${saved.length ? saved.map((m, i) => `${i + 1}. ${m.text}`).join('\n') : '(none)'}`,
          before?.role === 'assistant' ? `The assistant had just said: "${before.content.slice(0, 300)}"` : '',
          `The user's latest message: "${last.content.slice(0, 2000)}"`
        ]
          .filter(Boolean)
          .join('\n\n')
      }
    ]
  })
  if (!res.ok) return none
  const json = /\{[\s\S]*\}/.exec(res.value.text)?.[0]
  let parsed: { add?: unknown; remove?: unknown }
  try {
    parsed = JSON.parse(json ?? '')
  } catch {
    return none
  }
  const remove = Array.isArray(parsed.remove) ? parsed.remove : []
  const add = Array.isArray(parsed.add) ? parsed.add : []
  return {
    removeIds: [...new Set(remove.filter((x): x is number => Number.isInteger(x)))].flatMap((n) => (saved[n - 1] ? [saved[n - 1].id] : [])),
    add: add
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 3)
      .slice(0, MAX_NEW)
      .map((f) => f.trim().slice(0, MAX_FACT_CHARS))
  }
}

/** Save a proposal. Returns what actually changed. */
export function applyMemory(p: MemoryProposal): MemoryChanges {
  const changes: MemoryChanges = { added: [], removed: [] }
  for (const id of p.removeIds) {
    const item = listMemory().find((m) => m.id === id)
    if (!item) continue
    deleteMemory(id)
    changes.removed.push(item.text)
  }
  for (const fact of p.add) {
    if (listMemory().some((m) => m.text.toLowerCase() === fact.toLowerCase())) continue // already known
    try {
      changes.added.push(addMemory(fact).text)
    } catch {
      break // memory is full
    }
  }
  return changes
}
