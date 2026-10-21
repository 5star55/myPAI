/**
 * ollama.ts — give Ollama models a real context window.
 *
 * Ollama's OpenAI-compatible API ignores num_ctx and keeps only about 2k tokens
 * of each prompt, silently dropping the START (the system prompt and the tool
 * rules). pai's prompt alone is about that size, so the model would often never
 * see its instructions.
 *
 * Fix: create "<model>-pai" with a larger num_ctx (MODEL_CONTEXT_TOKENS) through
 * Ollama's own API, and use that name. It shares the original weights (no extra
 * disk space, created in a moment), and is refreshed once per app start so a
 * changed context size applies. Any problem: fall back to the original model.
 */
const OLLAMA_PORT = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):11434(\/|$)/

export const isOllama = (baseURL: string): boolean => OLLAMA_PORT.test(baseURL)

/** "llama3.1:8b" -> "llama3.1:8b-pai", "mistral" -> "mistral:latest-pai". */
export const paiModelName = (model: string): string => `${model.includes(':') ? model : `${model}:latest`}-pai`

const ready = new Map<string, Promise<string>>()

/** The model name to send: the "-pai" variant on Ollama, otherwise unchanged. */
export function withContext(model: string, baseURL: string, contextTokens: number): Promise<string> {
  if (!isOllama(baseURL) || model.endsWith('-pai')) return Promise.resolve(model)
  const key = `${model}@${contextTokens}`
  let p = ready.get(key)
  if (!p) {
    p = create(model, baseURL, contextTokens)
    ready.set(key, p)
  }
  return p
}

async function create(model: string, baseURL: string, contextTokens: number): Promise<string> {
  const root = baseURL.replace(/\/v1\/?$/, '').replace(/\/$/, '')
  const name = paiModelName(model)
  try {
    const res = await fetch(`${root}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, from: model, parameters: { num_ctx: contextTokens }, stream: false }),
      signal: AbortSignal.timeout(30_000)
    })
    const body = (await res.json().catch(() => ({}))) as { status?: string; error?: string }
    if (!res.ok || body.status !== 'success') throw new Error(body.error ?? `HTTP ${res.status}`)
    console.log(`[model] using ${name} (context ${contextTokens} tokens)`)
    return name
  } catch (err) {
    // Not fatal: the original model still works, just with Ollama's short context.
    console.warn(`[model] could not set up ${name}; using ${model} with Ollama's default context:`, err instanceof Error ? err.message : err)
    ready.delete(`${model}@${contextTokens}`) // try again next time
    return model
  }
}
