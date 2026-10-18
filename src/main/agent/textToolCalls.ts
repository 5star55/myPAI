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

export function extractTextToolCalls(text: string, toolNames: string[]): { calls: TextToolCall[]; rest: string } {
  const calls: TextToolCall[] = []
  let rest = text
  for (const block of jsonBlocks(text).reverse()) {
    let obj: unknown
    try {
      obj = JSON.parse(block.json)
    } catch {
      continue
    }
    const o = obj as { name?: unknown; parameters?: unknown; arguments?: unknown; function?: { name?: unknown; arguments?: unknown } }
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
