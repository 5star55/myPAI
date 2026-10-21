/**
 * config.ts — the ONLY place that reads model settings.
 *
 * Values come from the .env file in the project root (see .env.example).
 * To switch from Ollama to Nebius, edit .env — never this file.
 */
import { join } from 'node:path'
import { app } from 'electron'
import dotenv from 'dotenv'
import type { PublicConfig } from '@shared/ipc'

export type ModelMode = 'mock' | 'live'

export interface AppConfig {
  mode: ModelMode
  baseURL: string
  apiKey: string
  smallModel: string
  bigModel: string
  smallMaxTokens: number
  bigMaxTokens: number
  /** How many tokens the model can read at once (prompt + reply). Used to fit history, and for Ollama's num_ctx. */
  contextTokens: number
  tavilyApiKey: string
  warnings: string[]
}

// Defaults = local Ollama, so "live" works out of the box if Ollama is running.
const DEFAULTS = {
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama', // Ollama ignores the key, but the openai package requires one.
  model: 'llama3.1:8b',
  smallMaxTokens: 1024,
  bigMaxTokens: 1536,
  contextTokens: 8192
}

function readPositiveInt(raw: string | undefined, fallback: number, name: string, warnings: string[]): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n) && n > 0) return n
  warnings.push(`${name}="${raw}" is not a positive number; using ${fallback}.`)
  return fallback
}

function loadConfig(): AppConfig {
  // app.getAppPath() is the project root when running from source.
  dotenv.config({ path: join(app.getAppPath(), '.env'), quiet: true })
  const env = process.env
  const warnings: string[] = []

  let mode: ModelMode = 'mock'
  const rawMode = (env.MODEL_MODE ?? 'mock').trim().toLowerCase()
  if (rawMode === 'mock' || rawMode === 'live') mode = rawMode
  else warnings.push(`MODEL_MODE="${env.MODEL_MODE}" is not "mock" or "live"; using mock.`)

  const baseURL = env.MODEL_BASE_URL?.trim() || DEFAULTS.baseURL
  try {
    new URL(baseURL)
  } catch {
    warnings.push(`MODEL_BASE_URL="${baseURL}" is not a valid URL.`)
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(baseURL)
  const apiKey = env.MODEL_API_KEY?.trim() || (isLocal ? DEFAULTS.apiKey : '')
  if (mode === 'live' && !apiKey) warnings.push('MODEL_API_KEY is empty but the server is not local.')

  return {
    mode,
    baseURL,
    apiKey,
    smallModel: env.SMALL_MODEL?.trim() || DEFAULTS.model,
    bigModel: env.BIG_MODEL?.trim() || env.SMALL_MODEL?.trim() || DEFAULTS.model,
    smallMaxTokens: readPositiveInt(env.SMALL_MAX_TOKENS, DEFAULTS.smallMaxTokens, 'SMALL_MAX_TOKENS', warnings),
    bigMaxTokens: readPositiveInt(env.BIG_MAX_TOKENS, DEFAULTS.bigMaxTokens, 'BIG_MAX_TOKENS', warnings),
    contextTokens: readPositiveInt(env.MODEL_CONTEXT_TOKENS, DEFAULTS.contextTokens, 'MODEL_CONTEXT_TOKENS', warnings),
    tavilyApiKey: env.TAVILY_API_KEY?.trim() ?? '',
    warnings
  }
}

let cached: AppConfig | null = null

/** Read once at startup; restart the app after editing .env. */
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig()
  return cached
}

/** The safe subset of config the renderer may see (no secrets). */
export function getPublicConfig(): PublicConfig {
  const c = getConfig()
  return {
    mode: c.mode,
    baseURL: c.baseURL,
    smallModel: c.smallModel,
    bigModel: c.bigModel,
    hasApiKey: c.apiKey.length > 0,
    webSearchConfigured: c.tavilyApiKey.length > 0,
    warnings: c.warnings
  }
}
