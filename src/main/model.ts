/**
 * model.ts — every call to a language model goes through here.
 *
 *   MODEL_MODE=mock -> scripted replies (and fake tool calls), no network.
 *   MODEL_MODE=live -> any OpenAI-compatible server (Ollama, Nebius, ...).
 *
 * Callers pick a size:
 *   'small' = everyday chat (fast, cheap)
 *   'big'   = tool calling (smarter)
 *
 * This function never throws. It returns Result so the UI can show a clear
 * message instead of crashing.
 */
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  NotFoundError,
  RateLimitError
} from 'openai'
import type { Result } from '@shared/ipc'
import { getConfig } from './config'

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam
export type ToolSpec = OpenAI.Chat.ChatCompletionFunctionTool

export interface ToolCall {
  id: string
  name: string
  /** Raw JSON string from the model. Parse and validate before use. */
  arguments: string
}

export interface ModelReply {
  text: string
  toolCalls: ToolCall[]
  model: string
}

export interface CompleteRequest {
  messages: ChatMessage[]
  size: 'small' | 'big'
  tools?: ToolSpec[]
}

const REQUEST_TIMEOUT_MS = 60_000

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) {
    const c = getConfig()
    client = new OpenAI({
      baseURL: c.baseURL,
      apiKey: c.apiKey,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 1
    })
  }
  return client
}

export async function complete(req: CompleteRequest): Promise<Result<ModelReply>> {
  const c = getConfig()
  const model = req.size === 'big' ? c.bigModel : c.smallModel
  const maxTokens = req.size === 'big' ? c.bigMaxTokens : c.smallMaxTokens

  if (c.mode === 'mock') return { ok: true, value: mockReply(req) }

  try {
    const res = await getClient().chat.completions.create({
      model,
      messages: req.messages,
      max_tokens: maxTokens, // required on every request
      ...(req.tools?.length ? { tools: req.tools } : {})
    })
    const msg = res.choices[0]?.message
    if (!msg) return { ok: false, error: 'The model returned an empty response.' }

    const toolCalls: ToolCall[] = (msg.tool_calls ?? [])
      .filter((t) => t.type === 'function')
      .map((t) => ({ id: t.id, name: t.function.name, arguments: t.function.arguments }))

    return { ok: true, value: { text: msg.content ?? '', toolCalls, model } }
  } catch (err) {
    return { ok: false, error: describeError(err, model) }
  }
}

/** Turn library errors into one sentence a user can act on. */
function describeError(err: unknown, model: string): string {
  const { baseURL } = getConfig()
  // Order matters: the timeout class is a subclass of the connection class.
  if (err instanceof APIConnectionTimeoutError) return `The model server at ${baseURL} took too long to answer.`
  if (err instanceof APIConnectionError)
    return `Can't reach the model server at ${baseURL}. If you use Ollama, is it running?`
  if (err instanceof AuthenticationError) return 'The API key was rejected. Check MODEL_API_KEY in .env.'
  if (err instanceof NotFoundError)
    return `Model "${model}" was not found on the server. Check SMALL_MODEL / BIG_MODEL in .env (Ollama: run "ollama pull ${model}").`
  if (err instanceof RateLimitError) return 'Rate limit reached. Wait a moment and try again.'
  if (err instanceof APIError) return `The model server returned an error (${err.status ?? 'unknown'}): ${err.message}`
  return `Unexpected error calling the model: ${err instanceof Error ? err.message : String(err)}`
}

// ---------------------------------------------------------------------------
// Mock mode: deterministic replies so every feature can be built offline.
// ---------------------------------------------------------------------------

let mockCallCounter = 0

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && typeof m.content === 'string') return m.content
  }
  return ''
}

function mockReply(req: CompleteRequest): ModelReply {
  const model = `mock-${req.size}`
  const last = req.messages[req.messages.length - 1]

  // After a tool ran, "summarize" its result the way a real model would.
  if (last?.role === 'tool') {
    const preview = String(last.content).slice(0, 300)
    return { text: `(mock) Here is what I found:\n${preview}`, toolCalls: [], model }
  }

  // If tools are offered and the user asked for files, fake a tool call.
  const text = lastUserText(req.messages)
  const wantsFiles = /\b(list|show)\b.*\bfiles?\b/i.test(text)
  const hasListTool = req.tools?.some((t) => t.function.name === 'list_files')
  if (wantsFiles && hasListTool) {
    const folder = text.match(/(?:in|of)\s+["']?([^"'\n]+?)["']?\s*$/i)?.[1] ?? '~/Downloads'
    return {
      text: '',
      toolCalls: [{ id: `mock_call_${++mockCallCounter}`, name: 'list_files', arguments: JSON.stringify({ folder }) }],
      model
    }
  }

  if (!text) return { text: '(mock) Hello! I am pai, running in mock mode.', toolCalls: [], model }
  return { text: `(mock) You said: "${text}". Set MODEL_MODE=live in .env for real answers.`, toolCalls: [], model }
}
