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
  'memory',
  'shell'
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
  memory: 'Remember facts about you',
  shell: 'Run terminal commands'
}

/** How terminal commands are approved. */
export type CommandMode = 'ask' | 'auto'

export const TONES = ['friendly', 'professional', 'playful', 'concise'] as const
export type Tone = (typeof TONES)[number]

/** How replies are spoken. */
export interface VoiceChoice {
  /** 'natural' = local AI voice (Kokoro); 'system' = the OS's built-in voices. */
  engine: 'natural' | 'system'
  /** Kokoro voice id (e.g. "af_heart") or a system voice name (e.g. "Ava (Premium)"). */
  voice: string
  /** Speaking speed, 0.8 – 1.3. */
  rate: number
}

export interface NaturalVoice {
  id: string
  name: string
  accent: 'American' | 'British'
  gender: 'female' | 'male'
  best?: boolean
}

/** The best-rated Kokoro voices, with friendly names. */
export const NATURAL_VOICES: NaturalVoice[] = [
  { id: 'af_heart', name: 'Heart', accent: 'American', gender: 'female', best: true },
  { id: 'af_bella', name: 'Bella', accent: 'American', gender: 'female', best: true },
  { id: 'af_nicole', name: 'Nicole', accent: 'American', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah', accent: 'American', gender: 'female' },
  { id: 'am_michael', name: 'Michael', accent: 'American', gender: 'male' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'American', gender: 'male' },
  { id: 'am_puck', name: 'Puck', accent: 'American', gender: 'male' },
  { id: 'bf_emma', name: 'Emma', accent: 'British', gender: 'female', best: true },
  { id: 'bf_isabella', name: 'Isabella', accent: 'British', gender: 'female' },
  { id: 'bm_george', name: 'George', accent: 'British', gender: 'male' },
  { id: 'bm_fable', name: 'Fable', accent: 'British', gender: 'male' }
]

export const DEFAULT_VOICE: VoiceChoice = { engine: 'natural', voice: 'af_heart', rate: 1 }

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
  /** Hands-free: listen for "Hey <assistantName>" all the time (mic stays open). */
  wakeWord: boolean
  voice: VoiceChoice
  /** 'ask' = confirm every command; 'auto' = run and report (risky ones still ask). */
  commandMode: CommandMode
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

export interface WebResult {
  title: string
  url: string
  site: string
  snippet: string
}

/** Rich results a tool can return for the UI (shown as cards, not text). */
export type ToolData = { kind: 'web'; query: string; results: WebResult[] }

/** One tool the assistant used while answering. */
export interface ToolStep {
  tool: string
  target: string
  status: StepStatus
  summary: string
  data?: ToolData
  /** A preview of what the tool produced (command output, file contents…), shown under the step. */
  output?: string
  /** Ran without a dialog because of a setting (e.g. commands in "run and report" mode). */
  auto?: boolean
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
  /** Exact content to show: the command, or the start of a file being written. */
  preview?: string
  /** Which task asked (Ecospace), e.g. "Organize my Downloads". */
  context?: string
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
  /** 'builtin' ships with the app (read-only); 'user' = uploaded or created by you. */
  source: 'builtin' | 'user'
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

/** A live suggestion chip under the message box. */
export interface Suggestion {
  label: string
  /** The message this suggestion stands for. */
  text: string
  /** true = send right away; false = put it in the message box to finish. */
  send: boolean
}

// ---------------------------------------------------------------------------
// Ecospace tasks
// ---------------------------------------------------------------------------

export type TaskStatus = 'queued' | 'running' | 'needs-you' | 'done' | 'failed' | 'stopped'
export type TaskSource = 'ecospace' | 'orb' | 'voice'

/** A job given to the assistant in the Ecospace (or from the orb / voice). */
export interface Task {
  id: string
  title: string
  prompt: string
  source: TaskSource
  status: TaskStatus
  createdAt: string
  startedAt?: string
  finishedAt?: string
  steps: ToolStep[]
  /** The step running right now. */
  live?: { tool: string; target: string }
  /** Reply text so far, while it is being written. */
  partial?: string
  /** Final answer. */
  result?: string
  error?: string
}

/** How many tasks may run at the same time; the rest wait in the queue. */
export const MAX_PARALLEL_TASKS = 3

// ---------------------------------------------------------------------------
// Saved conversations
// ---------------------------------------------------------------------------

/** One message as saved on disk, with everything shown in the chat. */
export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  /** ISO time the message was sent or received. */
  at: string
  steps?: ToolStep[]
  failed?: 'stopped' | 'error'
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: StoredMessage[]
}

export interface ConversationMeta {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  /** For search results: a bit of the matching text. */
  match?: string
}

/** Everything about one skill, for viewing or editing. */
export interface SkillDetail {
  id: string
  source: 'builtin' | 'user'
  name: string
  description: string
  permissions: PermissionKey[]
  instructions: string
}

/** What the editor sends (no id = a new skill). */
export interface SkillDraft {
  id?: string
  name: string
  description: string
  permissions: PermissionKey[]
  instructions: string
}

/** A file being uploaded, shown for review before it is installed. */
export interface SkillImport {
  /** Pass back to installSkills() to install. Empty if the file is invalid. */
  token: string
  file: string
  name: string
  description: string
  permissions: PermissionKey[]
  instructions: string
  /** It has the same name as one of your skills and will replace it. */
  replaces?: boolean
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

/** What the hands-free voice is doing (shown on the floating orb). */
export interface VoiceStatus {
  /** 'review' = showing what was heard for a moment, with Send now / Edit. */
  state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'review'
  caption?: string
}

export type ReviewAction = 'send' | 'edit'

export type FloatSize = 'orb' | 'card' | 'panel'

/** The global push-to-talk shortcut. */
export const VOICE_HOTKEY = 'CommandOrControl+Shift+Space'

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
  reminderSnooze: 'reminders:snooze',
  testNotification: 'reminders:test-notification',
  skillsList: 'skills:list',
  skillsReload: 'skills:reload',
  skillsPick: 'skills:pick-files',
  skillsPreview: 'skills:preview',
  skillsInstall: 'skills:install',
  skillsGet: 'skills:get',
  skillsSave: 'skills:save',
  skillsDelete: 'skills:delete',
  skillsShowFolder: 'skills:show-folder',
  offerRespond: 'offer:respond',
  speechTranscribe: 'speech:transcribe',
  speechWarmUp: 'speech:warm-up',
  micAccess: 'speech:mic-access',
  suggest: 'suggest:get',
  taskStart: 'tasks:start',
  taskList: 'tasks:list',
  taskStop: 'tasks:stop',
  taskRetry: 'tasks:retry',
  taskDelete: 'tasks:delete',
  taskClearFinished: 'tasks:clear-finished',
  openEcospace: 'window:open-ecospace',
  floatFocus: 'float:focus',
  convList: 'conversations:list',
  convGet: 'conversations:get',
  convSave: 'conversations:save',
  convDelete: 'conversations:delete',
  convRename: 'conversations:rename',
  ttsSynthesize: 'tts:synthesize',
  ttsWarmUp: 'tts:warm-up',
  openVoiceSettings: 'tts:open-system-voices',
  voiceStatus: 'voice:set-status',
  voiceToggle: 'voice:toggle-request',
  voiceReview: 'voice:review-action',
  floatExpand: 'float:expand',
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
  'data:changed': { what: 'memory' | 'activity' | 'reminders' | 'profile' | 'skills' | 'conversations' }
  /** Main asks the chat screen to send this message (accepted proactive offer). */
  'chat:prefill': { text: string }
  /** Hotkey pressed: start/stop a hands-free conversation (sent to the chat window). */
  'voice:toggle': Record<string, never>
  /** Hands-free status for the floating orb. */
  'voice:status': VoiceStatus
  /** Orb's "Send now" / "Edit" during review (sent to the chat window). */
  'voice:review': { action: ReviewAction }
  /** A task changed (sent to every window). */
  'task:update': Task
  /** A task was deleted. */
  'task:removed': { id: string }
  /** Main asks the main window to show a screen. */
  'ui:navigate': { tab: 'ecospace' | 'chat' }
  /** A reminder is due (the orb shows a card; the main window reads it aloud). */
  'reminder:fired': { id: string; message: string }
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
  'chat:prefill',
  'voice:toggle',
  'voice:status',
  'voice:review',
  'task:update',
  'task:removed',
  'ui:navigate',
  'reminder:fired'
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
  /** Remind again in 10 minutes. */
  snoozeReminder(message: string): Promise<Result<void>>
  /** Send a test notification (false = this system doesn't support notifications). */
  testNotification(): Promise<Result<boolean>>

  listSkills(): Promise<Result<SkillInfo[]>>
  reloadSkills(): Promise<Result<SkillInfo[]>>
  /** Choose skill files with the system file picker; returns them for review (nothing installed yet). */
  pickSkillFiles(): Promise<Result<SkillImport[]>>
  /** Review files dropped onto the Skills page. */
  previewSkillFiles(files: File[]): Promise<Result<SkillImport[]>>
  /** Install reviewed files (installed switched off). Returns their ids. */
  installSkills(tokens: string[]): Promise<Result<string[]>>
  getSkill(id: string): Promise<Result<SkillDetail>>
  /** Create (no id) or update one of your own skills. */
  saveSkill(draft: SkillDraft): Promise<Result<SkillDetail>>
  /** Move one of your own skills to the Trash. */
  deleteSkill(id: string): Promise<Result<void>>
  showSkillsFolder(): Promise<Result<void>>

  respondOffer(id: string, choice: OfferChoice): Promise<Result<void>>

  /** Ask the OS for microphone access (macOS shows a prompt the first time). */
  requestMic(): Promise<Result<boolean>>
  /** Start loading the local speech model in the background. */
  warmUpSpeech(): Promise<Result<void>>
  /** Transcribe mono 16 kHz audio locally. Returns the text. */
  transcribe(audio: Float32Array): Promise<Result<string>>

  /** Chat window -> orb: what the hands-free voice is doing. */
  setVoiceStatus(status: VoiceStatus): Promise<Result<void>>
  /** Orb window size: just the orb, a small card (offer/voice), or the mini Ecospace panel. */
  setFloatExpanded(size: FloatSize): Promise<Result<void>>
  /** Give the orb window keyboard focus (so you can type a task). */
  focusFloat(): Promise<Result<void>>

  /** Give the assistant a task. It runs in the background (up to 3 at once). */
  startTask(prompt: string, source: TaskSource): Promise<Result<Task>>
  /** All tasks, newest first. */
  listTasks(): Promise<Result<Task[]>>
  stopTask(id: string): Promise<Result<void>>
  /** Run a finished task again (as a new task). */
  retryTask(id: string): Promise<Result<Task>>
  deleteTask(id: string): Promise<Result<void>>
  clearFinishedTasks(): Promise<Result<void>>
  /** Show the main window on the Ecospace. */
  openEcospace(): Promise<Result<void>>
  /** Start/stop a hands-free conversation (same as the hotkey). */
  toggleVoice(): Promise<Result<void>>
  /** Orb: answer the review of what was heard ("send now" or "edit in the chat"). */
  voiceReview(action: ReviewAction): Promise<Result<void>>

  /** Natural voice: turn text into speech (mono PCM) on this computer. */
  synthesize(text: string, voice: string, rate: number): Promise<Result<{ audio: Float32Array; sampleRate: number }>>
  /** Start loading the natural voice model in the background. */
  warmUpTts(): Promise<Result<void>>
  /** Open the OS settings page where better system voices can be downloaded. */
  openVoiceSettings(): Promise<Result<void>>

  /** Saved chats, newest first. With `query`, only chats whose title or messages match. */
  listConversations(query?: string): Promise<Result<ConversationMeta[]>>
  getConversation(id: string): Promise<Result<Conversation>>
  /** Create or update a chat (id from a previous save, or null for a new one). */
  saveConversation(id: string | null, messages: StoredMessage[]): Promise<Result<ConversationMeta>>
  deleteConversation(id: string): Promise<Result<void>>
  renameConversation(id: string, title: string): Promise<Result<ConversationMeta>>

  /** Live suggestions for what the user is typing or saying (local, no model call). */
  suggest(text: string): Promise<Result<Suggestion[]>>

  toggleChat(): Promise<Result<void>>
  /** Move the floating icon by a screen-pixel delta. */
  dragFloat(dx: number, dy: number): Promise<Result<void>>
  showFloatMenu(): Promise<Result<void>>

  /** Subscribe to a push event. Returns an unsubscribe function. */
  on<E extends EventName>(event: E, cb: (payload: EventMap[E]) => void): () => void
}
