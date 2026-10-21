/**
 * context.ts — keep each request inside the model's context window, and offer
 * only the tools that fit the request.
 *
 * If a prompt is too long, servers drop text silently (Ollama drops the START,
 * i.e. the system prompt). So we decide what goes, in this order: the oldest
 * chat turns first, then long tool output from earlier steps. The system prompt
 * and the newest message always stay.
 *
 * Small local models also choose tools much better from a short list, so tools
 * are grouped and only the groups the request mentions are offered. If nothing
 * matches (e.g. an Ecospace task worded in an unusual way), every tool is offered.
 */
import type { ChatTurn } from '@shared/ipc'
import type { ChatMessage } from '../model'
import type { Tool } from '../tools/types'

/** Rough but safe token count (real tokens are ~4 characters of English; code and other languages run shorter). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3.2)

const messageTokens = (m: ChatMessage): number =>
  8 + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')) + ('tool_calls' in m && m.tool_calls ? estimateTokens(JSON.stringify(m.tool_calls)) : 0)

export const totalTokens = (messages: ChatMessage[]): number => messages.reduce((n, m) => n + messageTokens(m), 0)

/** The newest turns that fit in `budget` tokens. Always keeps the last message; starts on a user turn. */
export function fitHistory(history: ChatTurn[], budget: number): ChatTurn[] {
  let used = 0
  let start = history.length
  while (start > 0) {
    const cost = 8 + estimateTokens(history[start - 1].content)
    if (start < history.length && used + cost > budget) break
    used += cost
    start--
  }
  const kept = history.slice(start)
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift()
  return kept
}

const SHORT_TOOL_OUTPUT = 1200

/** Over budget during a tool run: shorten earlier tool outputs (the newest two stay whole). */
export function shrinkToolOutputs(messages: ChatMessage[], budget: number): void {
  const toolIdx = messages.flatMap((m, i) => (m.role === 'tool' ? [i] : []))
  for (const i of toolIdx.slice(0, -2)) {
    if (totalTokens(messages) <= budget) return
    const m = messages[i] as Extract<ChatMessage, { role: 'tool' }>
    const content = typeof m.content === 'string' ? m.content : ''
    if (content.length > SHORT_TOOL_OUTPUT) messages[i] = { ...m, content: `${content.slice(0, SHORT_TOOL_OUTPUT)}\n…(shortened to save space)` }
  }
}

// ---------------------------------------------------------------------------
// Which tools to offer
// ---------------------------------------------------------------------------

const GROUPS: { tools: string[]; words: RegExp }[] = [
  {
    tools: ['list_files', 'read_file', 'create_file', 'create_folder', 'move_file', 'rename_file', 'delete_file', 'organize_folder', 'summarize_document'],
    words: /\b(files?|folders?|director(y|ies)|downloads|desktop|documents|pictures|rename|move|copy|delete|trash|remove|organi[sz]e|tidy|clean ?up|sort|create|make|write|save|read|open|summari[sz]e|pdf|docx?|txt|rtf|csv|notes?)\b|~\/|\/Users\//i
  },
  { tools: ['open_app'], words: /\b(open|launch|start|app|application)\b/i },
  { tools: ['set_reminder', 'list_reminders'], words: /\b(remind|reminders?|alarm|timer|schedule|tomorrow|tonight|at \d|in \d+ ?(min|minute|hour|h)s?)\b/i },
  {
    tools: ['web_search'],
    words: /\b(search|look ?up|google|web|online|internet|news|latest|current|today'?s|price|cost|weather|score|who won|release|version|update)\b/i
  },
  {
    tools: ['run_command'],
    words: /\b(run|execute|command|terminal|shell|script|install|git|npm|pip|python3?|node|brew|disk|space|storage|process(es)?|cpu|memory usage|ram|battery|wi-?fi|network|ip address|system|uptime|ping|port)\b/i
  }
]
/** Cheap, run without asking, and useful anywhere. */
const ALWAYS = ['save_memory', 'recall_memory']

/** The tools worth offering for this request (falls back to all of them). */
export function pickTools(tools: Tool[], recentUserText: string): Tool[] {
  const wanted = new Set(ALWAYS)
  let matched = false
  for (const g of GROUPS) {
    if (!g.words.test(recentUserText)) continue
    matched = true
    g.tools.forEach((t) => wanted.add(t))
  }
  if (!matched) return tools
  // Anything on the computer that no file tool covers can still be done with a command.
  if (wanted.has('list_files')) wanted.add('run_command')
  return tools.filter((t) => wanted.has(t.name))
}
