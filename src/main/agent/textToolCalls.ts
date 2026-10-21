/**
 * textToolCalls.ts — some local models (e.g. Llama via Ollama) sometimes WRITE
 * a tool call as text instead of using the tool-calling interface:
 *
 *   I'll search for that. {"name": "web_search", "parameters": {"query": "..."}}
 *
 * This finds such calls for known tools, so they run properly (still through
 * the permission dialog) and the raw JSON is removed from the reply.
 */
export interface TextToolCall {
  name: string
  arguments: string
}

/** Every balanced {...} block in the text, with its position. */
function jsonBlocks(text: string): { start: number; end: number; json: string }[] {
  const out: { start: number; end: number; json: string }[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0
    let inString = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inString) {
        if (c === '\\') j++
        else if (c === '"') inString = false
      } else if (c === '"') inString = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        out.push({ start: i, end: j + 1, json: text.slice(i, j + 1) })
        i = j
        break
      }
    }
  }
  return out
}

/** JSON.parse, forgiving the shell-style \' escapes models write inside strings (not valid JSON). */
function parseLoose(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    try {
      return JSON.parse(json.replace(/\\'/g, "'"))
    } catch {
      return undefined
    }
  }
}

/** Still broken after repair, but clearly a tool call: {"name": "...", "parameters"|"arguments": ...}. */
const CALL_LIKE = /^\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(parameters|arguments)"\s*:/

interface CallShape {
  name?: unknown
  parameters?: unknown
  arguments?: unknown
  function?: { name?: unknown; arguments?: unknown }
}

/** The tool name if this JSON value is shaped like a tool call, else null. */
function callName(obj: unknown): string | null {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null
  const o = obj as CallShape
  if (typeof o.function?.name === 'string') return o.function.name
  if (typeof o.name === 'string' && ('parameters' in o || 'arguments' in o)) return o.name
  return null
}

export function extractTextToolCalls(text: string, toolNames: string[]): { calls: TextToolCall[]; rest: string } {
  const calls: TextToolCall[] = []
  let rest = text
  for (const block of jsonBlocks(text).reverse()) {
    const obj = parseLoose(block.json)
    if (obj === undefined) continue
    const o = obj as CallShape
    const name = typeof o.name === 'string' ? o.name : typeof o.function?.name === 'string' ? o.function.name : null
    if (!name || !toolNames.includes(name)) continue
    const rawArgs = o.parameters ?? o.arguments ?? o.function?.arguments ?? {}
    const args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs)
    calls.unshift({ name, arguments: args })
    rest = rest.slice(0, block.start) + rest.slice(block.end)
  }
  // Tidy leftovers like code fences that wrapped the JSON.
  rest = rest.replace(/```(json)?\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return { calls, rest }
}

/**
 * Tool-call-shaped JSON for something that is NOT a tool (e.g. a skill name:
 * {"name": "Daily Planner", "parameters": {...}}). It can't run, and must
 * never be shown to the user as the answer. Returns the names and the text
 * without those blocks.
 */
export function findStrayToolCalls(text: string): { names: string[]; rest: string } {
  const names: string[] = []
  let rest = text
  for (const block of jsonBlocks(text).reverse()) {
    const obj = parseLoose(block.json)
    // Unreadable but tool-call shaped: still never show it as the answer.
    const name = obj === undefined ? (CALL_LIKE.test(block.json) ? (/"name"\s*:\s*"([^"]+)"/.exec(block.json)?.[1] ?? null) : null) : callName(obj)
    if (!name) continue
    names.unshift(name)
    rest = rest.slice(0, block.start) + rest.slice(block.end)
  }
  rest = rest.replace(/```(json)?\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return { names, rest }
}
