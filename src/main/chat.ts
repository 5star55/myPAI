/**
 * chat.ts — everyday chat (small model, no tools yet).
 *
 * The renderer sends the visible history. We never trust it blindly:
 * only user/assistant turns are accepted, sizes are capped, and the
 * system prompt is always added here in main.
 */
import { CHAT_LIMITS, type ChatReply, type ChatTurn, type Result } from '@shared/ipc'
import { complete, type ChatMessage } from './model'
import { buildSystemPrompt } from './prompt'

/** Check the shape of untrusted input from the renderer. */
function validateHistory(input: unknown): Result<ChatTurn[]> {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'Nothing to send.' }

  const turns: ChatTurn[] = []
  for (const item of input) {
    const role = (item as ChatTurn)?.role
    const content = (item as ChatTurn)?.content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return { ok: false, error: 'Invalid chat message.' }
    }
    if (content.length > CHAT_LIMITS.maxMessageChars) {
      return { ok: false, error: `Message is too long (max ${CHAT_LIMITS.maxMessageChars} characters).` }
    }
    turns.push({ role, content })
  }

  const last = turns[turns.length - 1]
  if (last.role !== 'user' || !last.content.trim()) return { ok: false, error: 'Please type a message.' }

  // Keep only the most recent turns so requests stay small.
  return { ok: true, value: turns.slice(-CHAT_LIMITS.maxHistoryTurns) }
}

export async function sendChat(input: unknown): Promise<Result<ChatReply>> {
  const history = validateHistory(input)
  if (!history.ok) return history

  const messages: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt() }, ...history.value]
  const res = await complete({ size: 'small', messages })
  if (!res.ok) return res

  const text = res.value.text.trim() || '(The model returned an empty reply.)'
  return { ok: true, value: { text, model: res.value.model } }
}
