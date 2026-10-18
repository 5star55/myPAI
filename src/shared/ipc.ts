/**
 * The IPC contract between main and renderer.
 *
 * Both sides import from this file, so a renamed channel or a changed type
 * becomes a compile error instead of a silent runtime bug.
 */

/** Every IPC call returns this shape. The renderer never has to catch exceptions. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** What the UI is allowed to know about the config. Never includes the API key. */
export interface PublicConfig {
  mode: 'mock' | 'live'
  baseURL: string
  smallModel: string
  bigModel: string
  hasApiKey: boolean
  /** Problems found in .env, shown to the user instead of crashing. */
  warnings: string[]
}

/** One visible chat message. Only these two roles can come from the UI. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatReply {
  text: string
  model: string
}

/** Limits enforced in main (and mirrored in the UI for a nicer experience). */
export const CHAT_LIMITS = {
  maxMessageChars: 8000,
  maxHistoryTurns: 20
} as const

/** Channel names live in one place. */
export const IPC = {
  getConfig: 'app:get-config',
  chatSend: 'chat:send'
} as const

/** The API the preload script exposes on window.pai. */
export interface PaiApi {
  getConfig(): Promise<Result<PublicConfig>>
  /** Send the conversation so far; the last turn must be the user's new message. */
  sendChat(history: ChatTurn[]): Promise<Result<ChatReply>>
}
