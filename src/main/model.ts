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
  APIUserAbortError,
  AuthenticationError,
  NotFoundError,
  RateLimitError
} from 'openai'
import type { Result } from '@shared/ipc'
import { getConfig } from './config'
import { mockReply } from './mock'
import { withContext } from './ollama'

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
  /** Aborts the request (used by the off switch and the Stop button). */
  signal?: AbortSignal
  /** If given, the reply is streamed and each new piece of text is passed here. */
  onText?: (delta: string) => void
  /** Default: low for tool calling (precise), higher for chat (natural). */
  temperature?: number
  /** A text reply cut off by the token limit is continued (up to this many times). */
  continueIfCut?: number
}

/** Low temperature keeps tool calls and arguments precise; chat gets a little more life. */
const TEMPERATURE = { big: 0.2, small: 0.6 }
const CONTINUE_NOTE = 'Continue exactly where you stopped, mid-sentence if needed. Do not repeat anything or add a preamble.'

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

  if (c.mode === 'mock') {
    await new Promise((r) => setTimeout(r, 350)) // feel a little like a real model
    if (req.signal?.aborted) return { ok: false, error: 'Stopped.' }
    const reply = mockReply(req.messages, req.tools ?? [])
    if (req.onText && reply.text) {
      // Fake streaming: a few words at a time.
      for (const piece of reply.text.match(/\S+\s*/g) ?? []) {
        if (req.signal?.aborted) return { ok: false, error: 'Stopped.' }
        req.onText(piece)
        await new Promise((r) => setTimeout(r, 25))
      }
    }
    return { ok: true, value: { ...reply, model: `mock-${req.size}` } }
  }

  try {
    const name = await withContext(model, c.baseURL, c.contextTokens)
    const messages = [...req.messages]
    let text = ''
    let toolCalls: ToolCall[] = []
    for (let part = 0; ; part++) {
      const body = {
        model: name,
        messages,
        max_tokens: maxTokens, // required on every request
        temperature: req.temperature ?? TEMPERATURE[req.size],
        ...(req.tools?.length ? { tools: req.tools } : {})
      }
      let res: OpenAI.Chat.ChatCompletion
      if (req.onText) {
        // Streaming: text arrives piece by piece; tool calls are assembled by the SDK.
        const onText = req.onText
        const stream = getClient().chat.completions.stream(body, { signal: req.signal })
        stream.on('content', (delta) => onText(delta))
        res = await stream.finalChatCompletion()
      } else {
        res = await getClient().chat.completions.create(body, { signal: req.signal })
      }
      const choice = res.choices[0]
      const msg = choice?.message
      if (!msg) return { ok: false, error: 'The model returned an empty response.' }

      toolCalls = (msg.tool_calls ?? [])
        .filter((t) => t.type === 'function')
        .map((t) => ({ id: t.id, name: t.function.name, arguments: t.function.arguments }))
      text += msg.content ?? ''

      // Cut off by max_tokens mid-answer: ask for the rest instead of ending on half a sentence.
      const cut = choice.finish_reason === 'length' && toolCalls.length === 0 && (msg.content ?? '').trim()
      if (!cut || part >= (req.continueIfCut ?? 0) || req.signal?.aborted) break
      messages.push({ role: 'assistant', content: msg.content ?? '' }, { role: 'user', content: CONTINUE_NOTE })
    }

    return { ok: true, value: { text, toolCalls, model } }
  } catch (err) {
    return { ok: false, error: describeError(err, model) }
  }
}

/** Turn library errors into one sentence a user can act on. */
function describeError(err: unknown, model: string): string {
  const { baseURL } = getConfig()
  if (err instanceof APIUserAbortError) return 'Stopped.'
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
