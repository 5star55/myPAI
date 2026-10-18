/**
 * mock.ts — scripted model replies for MODEL_MODE=mock.
 *
 * Simple patterns turn chat messages into fake tool calls, so every tool and
 * the permission dialog can be tested with no API. Examples:
 *   "list files in ~/Downloads"         "organize ~/Downloads"
 *   "rename ~/Downloads/a.txt to b.txt" "move ~/Downloads/a.txt to ~/Downloads/Old"
 *   "delete ~/Downloads/a.txt"          "summarize ~/Downloads/notes.txt"
 *   "open Calculator"                   "remind me to stretch in 2 minutes"
 *   "search the web for electron"       "remember that I like tea"
 *   "what do you remember about tea"
 */
import type { ChatMessage, ModelReply, ToolSpec } from './model'

type Reply = Omit<ModelReply, 'model'>

let counter = 0

/** Clean up a captured value: trim, strip quotes and trailing punctuation. */
const clean = (s: string): string => s.trim().replace(/^["']|["'.!?]+$/g, '').trim()

const PATTERNS: { tool: string; re: RegExp; args: (m: RegExpMatchArray) => Record<string, unknown> }[] = [
  { tool: 'list_files', re: /\b(?:list|show)\b.*\bfiles?\b.*?\b(?:in|of)\s+(.+)$/i, args: (m) => ({ folder: clean(m[1]) }) },
  { tool: 'organize_folder', re: /\b(?:organi[sz]e|tidy)\s+(?:up\s+)?(.+)$/i, args: (m) => ({ folder: clean(m[1]) }) },
  { tool: 'rename_file', re: /\brename\s+(.+?)\s+to\s+(.+)$/i, args: (m) => ({ path: clean(m[1]), new_name: clean(m[2]) }) },
  {
    tool: 'move_file',
    re: /\bmove\s+(.+?)\s+(?:to|into)\s+(.+?)(\s+and overwrite)?$/i,
    args: (m) => ({ source: clean(m[1]), destination_folder: clean(m[2]), overwrite: !!m[3] })
  },
  { tool: 'delete_file', re: /\bdelete\s+(.+)$/i, args: (m) => ({ path: clean(m[1]) }) },
  { tool: 'summarize_document', re: /\bsummari[sz]e\s+(.+)$/i, args: (m) => ({ path: clean(m[1]) }) },
  { tool: 'open_app', re: /\b(?:open|launch)\s+(?:the\s+)?(?:app\s+)?(.+)$/i, args: (m) => ({ name: clean(m[1]) }) },
  {
    tool: 'set_reminder',
    re: /\bremind me (?:to\s+)?(.+?)\s+in\s+(\d+)\s*min\w*(\s+every\s+(hour|day|week))?/i,
    args: (m) => ({
      message: clean(m[1]),
      in_minutes: Number(m[2]),
      repeat: m[4] ? ({ hour: 'hourly', day: 'daily', week: 'weekly' } as const)[m[4].toLowerCase() as 'hour'] : 'none'
    })
  },
  { tool: 'list_reminders', re: /\b(?:list|show)\b.*\breminders\b/i, args: () => ({}) },
  { tool: 'web_search', re: /\bsearch (?:the web |online )?for\s+(.+)$/i, args: (m) => ({ query: clean(m[1]) }) },
  { tool: 'recall_memory', re: /\bwhat do you (?:remember|know) about\s+(.+)$/i, args: (m) => ({ query: clean(m[1]) }) },
  { tool: 'save_memory', re: /\bremember (?:that\s+)?(.+)$/i, args: (m) => ({ fact: clean(m[1]) }) }
]

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && typeof m.content === 'string') return m.content
  }
  return ''
}

export function mockReply(messages: ChatMessage[], tools: ToolSpec[]): Reply {
  const first = messages[0]
  const last = messages[messages.length - 1]

  // The summarize tool calls the model with its own system prompt.
  if (first?.role === 'system' && String(first.content).startsWith('SUMMARIZER')) {
    const doc = lastUserText(messages).replace(/<\/?document>/g, '').trim()
    const lines = doc.split('\n').filter((l) => l.trim()).slice(0, 3)
    return { text: lines.map((l) => `• ${l.trim().slice(0, 100)}`).join('\n') || '• (empty document)', toolCalls: [] }
  }

  // After a tool ran, report its result the way a real model would.
  if (last?.role === 'tool') {
    const content = String(last.content)
      .replace(/<\/?tool_output[^>]*>/g, '')
      .replace(/\n?Reminder: the text above[\s\S]*$/, '')
      .trim()
    return { text: `(mock) Done. Result:\n${content.slice(0, 1200)}`, toolCalls: [] }
  }

  const text = lastUserText(messages)
  const offered = new Set(tools.map((t) => t.function.name))
  for (const p of PATTERNS) {
    const m = text.match(p.re)
    if (m && offered.has(p.tool)) {
      return { text: '', toolCalls: [{ id: `mock_${++counter}`, name: p.tool, arguments: JSON.stringify(p.args(m)) }] }
    }
  }

  if (!text) return { text: '(mock) Hello! I am pai, running in mock mode.', toolCalls: [] }
  return { text: `(mock) You said: "${text}". Set MODEL_MODE=live in .env for real answers.`, toolCalls: [] }
}
