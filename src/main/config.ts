/**
 * config.ts — the ONLY place that reads model settings.
 *
 * Running from source: values come from the .env file in the project root (see .env.example).
 * The packaged app never reads a .env (none is shipped): it uses Nemotron on Nebius
 * Token Factory, with the API key the user pastes in Settings → AI model.
 * A key pasted in Settings always wins over MODEL_API_KEY in .env.
 */
import { join } from 'node:path'
import { app } from 'electron'
import dotenv from 'dotenv'
import type { PublicConfig } from '@shared/ipc'
import { maskKey, savedApiKey } from './store/apiKey'

export type ModelMode = 'mock' | 'live'

export interface AppConfig {
  mode: ModelMode
  baseURL: string
  apiKey: string
  smallModel: string
  bigModel: string
  /** Looks at pictures attached to messages ('' = none set: the big model is tried). */
  visionModel: string
  smallMaxTokens: number
  bigMaxTokens: number
  /** How many tokens the model can read at once (prompt + reply). Used to fit history, and for Ollama's num_ctx. */
  contextTokens: number
  tavilyApiKey: string
  warnings: string[]
}

// Defaults when running from source = local Ollama, so "live" works out of the box if Ollama is running.
const DEFAULTS = {
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama', // Ollama ignores the key, but the openai package requires one.
  model: 'llama3.1:8b',
  smallMaxTokens: 1024,
  bigMaxTokens: 1536,
  contextTokens: 8192
}
/** Hosted models read and write far more: room for whole source files and long coding sessions. */
const HOSTED_DEFAULTS = { smallMaxTokens: 4096, bigMaxTokens: 8192, contextTokens: 65536 }
/** The packaged app: Nemotron on Nebius Token Factory. */
const PACKAGED_DEFAULTS = {
  mode: 'live',
  baseURL: 'https://api.tokenfactory.nebius.com/v1/',
  smallModel: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  bigModel: 'nvidia/nemotron-3-super-120b-a12b',
  visionModel: 'nvidia/Nemotron-3.5-Super-VL'
}

const isLocalUrl = (url: string): boolean => /localhost|127\.0\.0\.1/.test(url)

function readPositiveInt(raw: string | undefined, fallback: number, name: string, warnings: string[]): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n) && n > 0) return n
  warnings.push(`${name}="${raw}" is not a positive number; using ${fallback}.`)
  return fallback
}

/** Everything except the key, which can change while the app runs (pasted in Settings). */
type FileConfig = Omit<AppConfig, 'apiKey'> & { envApiKey: string }

function loadConfig(): FileConfig {
  const packaged = app.isPackaged
  // From source, app.getAppPath() is the project root. The installer never contains a .env.
  if (!packaged) dotenv.config({ path: join(app.getAppPath(), '.env'), quiet: true })
  const env = process.env
  const warnings: string[] = []

  let mode: ModelMode = 'mock'
  const rawMode = (env.MODEL_MODE ?? (packaged ? PACKAGED_DEFAULTS.mode : 'mock')).trim().toLowerCase()
  if (rawMode === 'mock' || rawMode === 'live') mode = rawMode
  else warnings.push(`MODEL_MODE="${env.MODEL_MODE}" is not "mock" or "live"; using mock.`)

  const baseURL = env.MODEL_BASE_URL?.trim() || (packaged ? PACKAGED_DEFAULTS.baseURL : DEFAULTS.baseURL)
  try {
    new URL(baseURL)
  } catch {
    warnings.push(`MODEL_BASE_URL="${baseURL}" is not a valid URL.`)
  }

  const isLocal = isLocalUrl(baseURL)
  const fallbackSmall = packaged ? PACKAGED_DEFAULTS.smallModel : DEFAULTS.model

  return {
    mode,
    baseURL,
    envApiKey: env.MODEL_API_KEY?.trim() || (isLocal ? DEFAULTS.apiKey : ''),
    smallModel: env.SMALL_MODEL?.trim() || fallbackSmall,
    bigModel: env.BIG_MODEL?.trim() || env.SMALL_MODEL?.trim() || (packaged ? PACKAGED_DEFAULTS.bigModel : DEFAULTS.model),
    smallMaxTokens: readPositiveInt(env.SMALL_MAX_TOKENS, isLocal ? DEFAULTS.smallMaxTokens : HOSTED_DEFAULTS.smallMaxTokens, 'SMALL_MAX_TOKENS', warnings),
    visionModel: env.VISION_MODEL?.trim() ?? (packaged ? PACKAGED_DEFAULTS.visionModel : ''),
    bigMaxTokens: readPositiveInt(env.BIG_MAX_TOKENS, isLocal ? DEFAULTS.bigMaxTokens : HOSTED_DEFAULTS.bigMaxTokens, 'BIG_MAX_TOKENS', warnings),
    contextTokens: readPositiveInt(env.MODEL_CONTEXT_TOKENS, isLocal ? DEFAULTS.contextTokens : HOSTED_DEFAULTS.contextTokens, 'MODEL_CONTEXT_TOKENS', warnings),
    tavilyApiKey: env.TAVILY_API_KEY?.trim() ?? '',
    warnings
  }
}

let cached: FileConfig | null = null
const fileConfig = (): FileConfig => (cached ??= loadConfig())

/** .env is read once at startup (restart after editing it). The key is looked up each time, so one pasted in Settings works at once. */
export function getConfig(): AppConfig {
  const { envApiKey, ...rest } = fileConfig()
  return { ...rest, apiKey: savedApiKey() || envApiKey }
}

/** Where the key comes from: pasted in Settings, MODEL_API_KEY in .env, or nowhere. */
export function apiKeySource(): 'settings' | 'env' | 'none' {
  if (savedApiKey()) return 'settings'
  const c = fileConfig()
  return c.envApiKey && !isLocalUrl(c.baseURL) ? 'env' : 'none'
}

/** Live, on a hosted server, and no key anywhere: nothing can be answered until one is pasted. */
export function needsApiKey(): boolean {
  const c = getConfig()
  return c.mode === 'live' && !isLocalUrl(c.baseURL) && !c.apiKey
}

/** The safe subset of config the renderer may see (no secrets: only the key's last 4 characters). */
export function getPublicConfig(): PublicConfig {
  const c = getConfig()
  return {
    mode: c.mode,
    baseURL: c.baseURL,
    smallModel: c.smallModel,
    bigModel: c.bigModel,
    hasApiKey: c.apiKey.length > 0,
    needsApiKey: needsApiKey(),
    apiKeySource: apiKeySource(),
    apiKeyHint: c.apiKey && !isLocalUrl(c.baseURL) ? maskKey(c.apiKey) : '',
    webSearchConfigured: c.tavilyApiKey.length > 0,
    warnings: c.warnings
  }
}
