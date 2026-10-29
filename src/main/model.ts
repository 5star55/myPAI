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
import { getConfig, needsApiKey } from './config'
import { mockReply } from './mock'
import { isOllama, withContext } from './ollama'

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
  /** Use this model instead of the one for `size` (e.g. the vision model). */
  model?: string
  tools?: ToolSpec[]
  /** Aborts the request (used by the off switch and the Stop button). */
  signal?: AbortSignal
  /** Each new piece of the reply as it streams in. */
  onText?: (delta: string) => void
  /** Reply length limit (default: SMALL_/BIG_MAX_TOKENS). */
  maxTokens?: number
  /** Default: low for tool calling (precise), higher for chat (natural). */
  temperature?: number
  /** A text reply cut off by the token limit is continued (up to this many times). */
  continueIfCut?: number
}

/** Low temperature keeps tool calls and arguments precise; chat gets a little more life. */
const TEMPERATURE = { big: 0.2, small: 0.6 }
const CONTINUE_NOTE = 'Continue exactly where you stopped, mid-sentence if needed. Do not repeat anything or add a preamble.'

// Long enough for a whole source file in one reply.
const REQUEST_TIMEOUT_MS = 180_000
/** No data for this long means the server stalled: that attempt is dropped and tried again. */
const STALL_MS = 45_000
/** Extra attempts after a stall, a dropped connection or a server error (only before any text was shown). */
const RETRIES = 2

class StalledError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Shown when no key is set (the packaged app, before one is pasted in Settings). */
export const NO_KEY_MESSAGE = 'Add your Nebius API key in Settings → AI model to start using pai.'

let client: { key: string; api: OpenAI } | null = null
/** One client per key: a key pasted in Settings is used from the next request on. */
function getClient(): OpenAI {
  const c = getConfig()
  if (!client || client.key !== c.apiKey) {
    client = { key: c.apiKey, api: new OpenAI({ baseURL: c.baseURL, apiKey: c.apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 }) }
  }
  return client.api
}

/**
 * Is this key accepted by the model server? Asks for its model list (cheap, uses no tokens).
 * 'unreachable' = offline or the server failed, so the key could not be checked either way.
 */
export async function checkApiKey(key: string): Promise<'ok' | 'rejected' | 'unreachable'> {
  const { baseURL } = getConfig()
  try {
    await new OpenAI({ baseURL, apiKey: key, timeout: 15_000, maxRetries: 0 }).models.list()
    return 'ok'
  } catch (err) {
    if (err instanceof AuthenticationError || (err instanceof APIError && err.status === 403)) return 'rejected'
    console.warn('[model] could not check the API key:', err instanceof Error ? err.message : err)
    return 'unreachable'
  }
}

export async function complete(req: CompleteRequest): Promise<Result<ModelReply>> {
  const c = getConfig()
  const model = req.model || (req.size === 'big' ? c.bigModel : c.smallModel)
  const maxTokens = req.maxTokens ?? (req.size === 'big' ? c.bigMaxTokens : c.smallMaxTokens)

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

  if (needsApiKey()) return { ok: false, error: NO_KEY_MESSAGE }

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
        ...(req.tools?.length ? { tools: req.tools } : {}),
        // Hosted reasoning models (e.g. Nemotron 3 on Nebius) otherwise spend the token budget thinking.
        ...(isOllama(c.baseURL) ? {} : { chat_template_kwargs: { enable_thinking: false } })
      }
      let res: OpenAI.Chat.ChatCompletion
      for (let attempt = 0; ; attempt++) {
        let shown = false
        try {
          res = await streamOnce(body, req.signal, (delta) => {
            shown = true
            req.onText?.(delta)
          })
          break
        } catch (err) {
          // Retry hiccups by itself, but never once the user has seen part of this reply.
          if (!isTransient(err) || shown || attempt >= RETRIES || req.signal?.aborted) throw err
          console.warn(`[model] ${err instanceof StalledError ? 'stalled' : 'request failed'}; trying again (${attempt + 1}/${RETRIES})`)
          await sleep(1000 * (attempt + 1))
        }
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

/**
 * One streamed request. Text and tool calls arrive piece by piece (the SDK assembles
 * tool calls), and if the server goes quiet for STALL_MS the attempt is given up.
 */
async function streamOnce(
  body: Parameters<OpenAI["chat"]["completions"]["stream"]>[0],
  signal: AbortSignal | undefined,
  onText: (delta: string) => void
): Promise<OpenAI.Chat.ChatCompletion> {
  const attempt = new AbortController()
  const stop = () => attempt.abort()
  signal?.addEventListener('abort', stop, { once: true })
  let stalled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const watch = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      stalled = true
      attempt.abort()
    }, STALL_MS)
  }
  watch()
  try {
    const stream = getClient().chat.completions.stream(body, { signal: attempt.signal })
    stream.on('chunk', watch)
    stream.on('content', (delta) => onText(delta))
    return await stream.finalChatCompletion()
  } catch (err) {
    throw stalled ? new StalledError('stalled') : err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

/** Worth trying again: a stall, a dropped or timed-out connection, or a server-side error. */
function isTransient(err: unknown): boolean {
  if (err instanceof StalledError || err instanceof APIConnectionError) return true
  return err instanceof APIError && !(err instanceof APIUserAbortError) && (err.status ?? 0) >= 500
}

/**
 * Turn library errors into one plain sentence for the user. The technical detail
 * (server URL, .env hints) always goes to the log, and is shown only in mock mode.
 */
function describeError(err: unknown, model: string): string {
  if (err instanceof APIUserAbortError) return 'Stopped.'
  const { baseURL, mode } = getConfig()
  const [friendly, detail] = explainError(err, model, baseURL)
  console.error(`[model] ${detail}`)
  return mode === 'mock' ? `${friendly} (${detail})` : friendly
}

function explainError(err: unknown, model: string, baseURL: string): [friendly: string, detail: string] {
  const local = isOllama(baseURL)
  if (err instanceof StalledError)
    return ['The AI service stopped responding. Please try again in a moment.', `${baseURL} stalled (no data for ${STALL_MS / 1000}s)`]
  // Order matters: the timeout class is a subclass of the connection class.
  if (err instanceof APIConnectionTimeoutError)
    return ['That took too long to answer. Please try again.', `${baseURL} timed out`]
  if (err instanceof APIConnectionError)
    return local
      ? ["Can't reach the AI on this computer. Make sure Ollama is running.", `can't reach ${baseURL}`]
      : ["Can't connect right now. Check your internet connection and try again.", `can't reach ${baseURL}`]
  if (err instanceof AuthenticationError)
    return ['Your API key was rejected. Paste a valid Nebius key in Settings → AI model.', 'API key rejected (Settings → AI model, or MODEL_API_KEY in .env)']
  if (err instanceof NotFoundError)
    return [
      "pai's AI model isn't available right now. Its setup needs updating.",
      `model "${model}" not found; check SMALL_MODEL / BIG_MODEL in .env${local ? ` or run "ollama pull ${model}"` : ''}`
    ]
  if (err instanceof RateLimitError) return ['Lots of requests right now. Wait a moment and try again.', 'rate limited (429)']
  if (err instanceof APIError)
    return (err.status ?? 0) >= 500
      ? ['The AI service is having trouble right now. Please try again in a moment.', `server error ${err.status}: ${err.message}`]
      : ['Something went wrong getting an answer. Please try again.', `server error ${err.status ?? 'unknown'}: ${err.message}`]
  return ['Something went wrong getting an answer. Please try again.', err instanceof Error ? err.message : String(err)]
}
