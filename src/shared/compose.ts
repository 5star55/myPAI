/**
 * compose.ts — "Complete my text": press a hotkey in a text box in another
 * app (Mail, Messages, Slack…) and pick how to finish what you're writing.
 *
 * Pure helpers shared by main and the UI (and easy to test).
 */

/**
 * Pressed in any app to get completions for the focused text box: ⌃⌥Space on macOS,
 * Ctrl+Alt+Space on Windows. (⌥Space is often taken by ChatGPT or Claude, and
 * Alt+Space opens the window menu on Windows.)
 */
export const COMPOSE_HOTKEY = 'Control+Alt+Space'

/** How to show COMPOSE_HOTKEY to people on each system. */
export const composeHotkeyLabel = (mac: boolean): string => (mac ? '⌃⌥Space' : 'Ctrl+Alt+Space')
const MODIFIER_NAMES = ['Control', 'Alt', 'Shift', 'Command', 'Super']

/** A usable shortcut: one or more different modifiers, then one key (e.g. Control+Alt+K). */
export function isValidHotkey(accel: unknown): accel is string {
  if (typeof accel !== 'string' || accel.length > 60) return false
  const parts = accel.split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  return (
    mods.length > 0 &&
    mods.every((m) => MODIFIER_NAMES.includes(m)) &&
    new Set(mods).size === mods.length &&
    key.length > 0 &&
    key.length <= 20
  )
}

/** Show a shortcut the way each system writes it: ⌃⌥Space on Mac, Ctrl+Alt+Space elsewhere. */
export function hotkeyLabelFor(accel: string, mac: boolean): string {
  const macNames: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘', Super: '⌘' }
  const winNames: Record<string, string> = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Command: 'Win', Super: 'Win' }
  const parts = accel.split('+')
  return mac ? parts.map((p) => macNames[p] ?? p).join('') : parts.map((p) => winNames[p] ?? p).join('+')
}

/** An app (by macOS bundle id) where "Complete my text" may read the focused text box. */
export interface ComposeApp {
  id: string
  name: string
}

export interface ComposeSettings {
  /** Off by default: reading text in other apps is opt-in. */
  enabled: boolean
  /** Only these apps; anything else asks "Allow in <app>?" first. */
    /** The shortcut that starts Complete my text (Electron format, e.g. Control+Alt+Space). */
  hotkey: string
  apps: ComposeApp[]
  /** Allow sending the text to a cloud model (when .env points to one). Local models never need this. */
  allowCloud: boolean
}

export const DEFAULT_COMPOSE_APPS: ComposeApp[] = [
  { id: 'com.apple.mail', name: 'Mail' },
  { id: 'com.apple.MobileSMS', name: 'Messages' },
  { id: 'com.tinyspeck.slackmacgap', name: 'Slack' },
  { id: 'net.whatsapp.WhatsApp', name: 'WhatsApp' },
  { id: 'desktop.WhatsApp', name: 'WhatsApp (old)' },
  { id: 'com.hnc.Discord', name: 'Discord' },
  { id: 'com.apple.Safari', name: 'Safari' },
  { id: 'com.google.Chrome', name: 'Chrome' },
  { id: 'company.thebrowser.Browser', name: 'Arc' },
  { id: 'com.microsoft.edgemac', name: 'Edge' },
  { id: 'com.brave.Browser', name: 'Brave' },
  { id: 'org.mozilla.firefox', name: 'Firefox' }
]

/** Never read text here, even if asked: terminals and password managers. */
/** Never read text here, even if asked: terminals and password managers. */
export const NEVER_COMPOSE_APPS = [
  // macOS (bundle ids)
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'dev.warp.Warp-Stable',
  'com.apple.keychainaccess',
  'com.1password.1password',
  'com.agilebits.onepassword7',
  'com.bitwarden.desktop',
  'com.github.Electron', // pai itself while running from source
  // Windows (lowercase program names)
  'windowsterminal.exe',
  'wt.exe',
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'conhost.exe',
  'mintty.exe', // Git Bash
  'wsl.exe',
  'putty.exe',
  'keepass.exe',
  'keepassxc.exe',
  '1password.exe',
  'bitwarden.exe',
  'lastpass.exe',
  'dashlane.exe',
  'nordpass.exe',
  'electron.exe', // pai itself while running from source
  'pai.exe'
]

/** Same check, ignoring capitalisation (Windows program names come back in any case). */
export function isNeverComposeApp(id: string): boolean {
  const key = id.trim().toLowerCase()
  return NEVER_COMPOSE_APPS.some((n) => n.toLowerCase() === key)
}

export function defaultComposeSettings(): ComposeSettings {
  return { enabled: false, apps: DEFAULT_COMPOSE_APPS.map((a) => ({ ...a })), allowCloud: false, hotkey: COMPOSE_HOTKEY }
}

export const MAX_COMPLETIONS = 3
const MAX_COMPLETION_CHARS = 240

/** What the popup next to the caret shows. */
export type ComposeView =
  | { state: 'loading'; app: string }
  | { state: 'ready'; app: string; options: string[]; tail: string }
  | {
      state: 'error'
      app: string
      message: string
      /** A button that fixes it. */
      action?: { kind: 'allow-app' | 'open-access' | 'open-settings' | 'retry'; label: string }
    }

/** Last few words before the caret, shown faded before each option ("…see you at"). */
export function tailOf(before: string, maxChars = 40): string {
  const t = before.replace(/\s+/g, ' ').trimStart()
  if (t.length <= maxChars) return t
  const cut = t.slice(-maxChars)
  const space = cut.indexOf(' ')
  return `…${space > 0 && space < cut.length - 1 ? cut.slice(space + 1) : cut}`
}

/** One clean line: no newlines (Return would send a chat message), quotes or list markers. */
function cleanOne(raw: string, before: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  s = s.replace(/^(\d+[.)]|[-*•])\s+/, '') // "1. ", "- "
  s = s.replace(/^["“'‘](.*)["”'’]$/, '$1').trim()
  s = s.replace(/^(…|\.\.\.)\s*/, '')
  // Models sometimes repeat the end of the text first; drop the repeat.
  const end = before.replace(/\s+/g, ' ').trim()
  for (let n = Math.min(end.length, s.length, 80); n >= 4; n--) {
    if (s.toLowerCase().startsWith(end.slice(-n).toLowerCase())) {
      s = s.slice(n).trimStart()
      break
    }
  }
  return s.length > MAX_COMPLETION_CHARS ? `${s.slice(0, MAX_COMPLETION_CHARS).replace(/\s+\S*$/, '')}` : s
}

/** The model's reply (ideally a JSON array of strings) -> up to 3 distinct, clean completions. */
export function parseCompletions(raw: string, before: string): string[] {
  let items: string[] = []
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      const arr: unknown = JSON.parse(raw.slice(start, end + 1))
      if (Array.isArray(arr)) items = arr.filter((x): x is string => typeof x === 'string')
    } catch {
      /* fall back to lines */
    }
  }
  if (!items.length) items = raw.split('\n').filter((l) => l.trim() && !/^[[\]]$/.test(l.trim()))
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const s = cleanOne(item, before)
    const key = s.toLowerCase()
    if (!s || seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length === MAX_COMPLETIONS) break
  }
  return out
}

/** The exact text to insert at the caret: adds a space between words when needed. */
export function joinCompletion(before: string, completion: string): string {
  const c = completion.trimStart()
  if (!before || /[\s([{"“'‘/-]$/.test(before)) return c
  if (/^[,.!?;:)\]}'’”…]/.test(c)) return c
  return ` ${c}`
}

/** Clean up stored settings (from disk or the UI). */

    /** Clean up stored settings (from disk or the UI). */
export function sanitizeCompose(raw: unknown): ComposeSettings {
  const d = defaultComposeSettings()
  if (typeof raw !== 'object' || raw === null) return d
  const r = raw as Record<string, unknown>
  const apps: ComposeApp[] = []
  if (Array.isArray(r.apps)) {
    for (const a of r.apps as unknown[]) {
      const id = typeof (a as ComposeApp)?.id === 'string' ? (a as ComposeApp).id.trim().slice(0, 200) : ''
      const name = typeof (a as ComposeApp)?.name === 'string' ? (a as ComposeApp).name.trim().slice(0, 80) : ''
      if (id && !isNeverComposeApp(id) && !apps.some((x) => x.id === id)) apps.push({ id, name: name || id })
    }
  }
  return {
    enabled: r.enabled === true,
    apps: Array.isArray(r.apps) ? apps : d.apps,
    allowCloud: r.allowCloud === true,
    hotkey: isValidHotkey(r.hotkey) ? r.hotkey : d.hotkey
  }
}
