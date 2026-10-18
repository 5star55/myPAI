/**
 * The IPC contract between main and renderer.
 *
 * Both sides import from this file, so a renamed channel or a changed type
 * becomes a compile error instead of a silent runtime bug.
 */

/** Every IPC call returns this shape. The renderer never has to catch exceptions. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** What the UI is allowed to know about the config. Never includes API keys. */
export interface PublicConfig {
  mode: 'mock' | 'live'
  baseURL: string
  smallModel: string
  bigModel: string
  hasApiKey: boolean
  webSearchConfigured: boolean
  /** Problems found in .env, shown to the user instead of crashing. */
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Profile ("Generate your AI") and runtime state
// ---------------------------------------------------------------------------

/** Permission groups. Every tool belongs to exactly one group. */
export const PERMISSION_KEYS = [
  'files_read',
  'files_write',
  'files_delete',
  'documents',
  'apps',
  'reminders',
  'web',
  'memory'
] as const
export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  files_read: 'List files in approved folders',
  files_write: 'Move, rename and organize files',
  files_delete: 'Delete files (to Trash)',
  documents: 'Read and summarize documents',
  apps: 'Open apps',
  reminders: 'Set reminders',
  web: 'Search the web',
  memory: 'Remember facts about you'
}

export const TONES = ['friendly', 'professional', 'playful', 'concise'] as const
export type Tone = (typeof TONES)[number]

export interface Profile {
  setupComplete: boolean
  assistantName: string
  userName: string
  tone: Tone
  /** Absolute folder paths the assistant may touch. Enforced in code. */
  approvedFolders: string[]
  permissions: Record<PermissionKey, boolean>
  enabledSkills: string[]
  /** Proactive offers (active window, Downloads watcher). */
  proactive: boolean
}

export interface AppState {
  /** The off switch. When false, nothing runs. */
  enabled: boolean
  /** Quiet mode: no proactive offers. */
  quietMode: boolean
}

// ---------------------------------------------------------------------------
// Chat & agent
// ---------------------------------------------------------------------------

/** One visible chat message. Only these two roles can come from the UI. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export type StepStatus = 'ok' | 'denied' | 'error' | 'blocked'

/** One tool the assistant used while answering. */
export interface ToolStep {
  tool: string
  target: string
  status: StepStatus
  summary: string
}

export interface ChatReply {
  text: string
  model: string
  steps: ToolStep[]
}

/** Live progress while the agent works. */
export type AgentEvent =
  | { kind: 'tool-start'; tool: string; target: string }
  | { kind: 'tool-end'; step: ToolStep }
  /** A piece of the reply as the model writes it (streaming). */
  | { kind: 'text'; delta: string }
  /** The model moved on to a new round (e.g. after a tool); discard streamed text so far. */
  | { kind: 'text-reset' }

/** Limits enforced in main (and mirrored in the UI for a nicer experience). */
export const CHAT_LIMITS = {
  maxMessageChars: 8000,
  maxHistoryTurns: 20
} as const

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface PermissionRequest {
  id: string
  tool: string
  /** Human sentence, e.g. "Rename a file". */
  action: string
  /** The exact path (or app name / query) the action touches. */
  target: string
  /** 'ask' = first prompt, 'confirm' = second confirmation for destructive actions. */
  stage: 'ask' | 'confirm'
  destructive: boolean
  /** Offer the "always for this folder" checkbox (path tools, non-destructive only). */
  canRemember: boolean
  folder?: string
  /** Set when the action reaches OUTSIDE the approved folders: the folders involved. */
  outside?: string[]
}

export interface PermissionResponse {
  id: string
  allow: boolean
  always: boolean
  /** For outside requests: also add those folders to the approved list. */
  approveFolders?: boolean
}

// ---------------------------------------------------------------------------
// Stored data
// ---------------------------------------------------------------------------

export interface ActivityEntry {
  id: string
  time: string
  tool: string
  target: string
  result: StepStatus
  detail: string
}

export interface MemoryItem {
  id: string
  text: string
  createdAt: string
  updatedAt: string
}

export const REPEATS = ['none', 'hourly', 'daily', 'weekly'] as const
export type Repeat = (typeof REPEATS)[number]

export interface Reminder {
  id: string
  message: string
  /** ISO time of the next notification. */
  nextAt: string
  repeat: Repeat
  createdAt: string
}

export interface SkillInfo {
  id: string
  name: string
  description: string
  permissions: PermissionKey[]
  enabled: boolean
  /** Permissions the skill needs that are switched off in the profile. */
  missing: PermissionKey[]
  file: string
  /** Set when the file could not be parsed. */
  error?: string
}

// ---------------------------------------------------------------------------
// Proactive offers
// ---------------------------------------------------------------------------

export interface Offer {
  id: string
  text: string
  acceptLabel: string
}

export type OfferChoice = 'accept' | 'dismiss' | 'snooze'

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Request/response channels (renderer -> main). */
export const IPC = {
  getConfig: 'config:get',
  chatSend: 'chat:send',
  chatCancel: 'chat:cancel',
  permissionRespond: 'permission:respond',
  stateGet: 'state:get',
  stateSetEnabled: 'state:set-enabled',
  stateSetQuiet: 'state:set-quiet',
  profileGet: 'profile:get',
  profileSave: 'profile:save',
  pickFolder: 'folders:pick',
  approvalsList: 'approvals:list',
  approvalsRemove: 'approvals:remove',
  activityList: 'activity:list',
  activityClear: 'activity:clear',
  memoryList: 'memory:list',
  memoryAdd: 'memory:add',
  memoryUpdate: 'memory:update',
  memoryDelete: 'memory:delete',
  remindersList: 'reminders:list',
  remindersDelete: 'reminders:delete',
  skillsList: 'skills:list',
  skillsReload: 'skills:reload',
  offerRespond: 'offer:respond',
  speechTranscribe: 'speech:transcribe',
  speechWarmUp: 'speech:warm-up',
  micAccess: 'speech:mic-access',
  toggleChat: 'window:toggle-chat',
  floatDrag: 'float:drag',
  floatMenu: 'float:menu'
} as const

/** Push events (main -> renderer) and their payloads. */
export interface EventMap {
  'permission:request': PermissionRequest
  'permission:cancel': { id: string }
  'agent:event': AgentEvent
  'state:changed': AppState
  'offer:show': Offer
  'offer:clear': { id: string }
  'data:changed': { what: 'memory' | 'activity' | 'reminders' | 'profile' | 'skills' }
  /** Main asks the chat screen to send this message (accepted proactive offer). */
  'chat:prefill': { text: string }
}
export type EventName = keyof EventMap
export const EVENT_NAMES: EventName[] = [
  'permission:request',
  'permission:cancel',
  'agent:event',
  'state:changed',
  'offer:show',
  'offer:clear',
  'data:changed',
  'chat:prefill'
]

/** The API the preload script exposes on window.pai. */
export interface PaiApi {
  getConfig(): Promise<Result<PublicConfig>>
  /** Send the conversation so far; the last turn must be the user's new message. */
  sendChat(history: ChatTurn[]): Promise<Result<ChatReply>>
  cancelChat(): Promise<Result<void>>
  respondPermission(res: PermissionResponse): Promise<Result<void>>

  getState(): Promise<Result<AppState>>
  setEnabled(enabled: boolean): Promise<Result<AppState>>
  setQuiet(quiet: boolean): Promise<Result<AppState>>

  getProfile(): Promise<Result<Profile>>
  saveProfile(profile: Profile): Promise<Result<Profile>>
  pickFolder(): Promise<Result<string | null>>
  /** "Always allow" approvals, as "tool|folder" keys. */
  listApprovals(): Promise<Result<string[]>>
  removeApproval(key: string): Promise<Result<string[]>>

  listActivity(): Promise<Result<ActivityEntry[]>>
  clearActivity(): Promise<Result<void>>

  listMemory(): Promise<Result<MemoryItem[]>>
  addMemory(text: string): Promise<Result<MemoryItem>>
  updateMemory(id: string, text: string): Promise<Result<MemoryItem>>
  deleteMemory(id: string): Promise<Result<void>>

  listReminders(): Promise<Result<Reminder[]>>
  deleteReminder(id: string): Promise<Result<void>>

  listSkills(): Promise<Result<SkillInfo[]>>
  reloadSkills(): Promise<Result<SkillInfo[]>>

  respondOffer(id: string, choice: OfferChoice): Promise<Result<void>>

  /** Ask the OS for microphone access (macOS shows a prompt the first time). */
  requestMic(): Promise<Result<boolean>>
  /** Start loading the local speech model in the background. */
  warmUpSpeech(): Promise<Result<void>>
  /** Transcribe mono 16 kHz audio locally. Returns the text. */
  transcribe(audio: Float32Array): Promise<Result<string>>

  toggleChat(): Promise<Result<void>>
  /** Move the floating icon by a screen-pixel delta. */
  dragFloat(dx: number, dy: number): Promise<Result<void>>
  showFloatMenu(): Promise<Result<void>>

  /** Subscribe to a push event. Returns an unsubscribe function. */
  on<E extends EventName>(event: E, cb: (payload: EventMap[E]) => void): () => void
}
