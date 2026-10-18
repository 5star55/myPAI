/**
 * engine.ts — rule-based proactive offers.
 *
 * Rules look at the active app and the Downloads folder and may OFFER help.
 * An offer never acts by itself: "accept" sends a normal chat message, which
 * goes through the usual permission dialog.
 *
 *   accept  -> open chat and send the suggested message
 *   dismiss -> this rule stays quiet for 4 hours
 *   snooze  -> the same offer comes back in 15 minutes
 *
 * Offers only appear when: proactive is on in the profile, the assistant is
 * on, and quiet mode is off. At most one offer at a time, 5 min apart.
 */
import { basename, extname } from 'node:path'
import type { Offer } from '@shared/ipc'
import { newId } from '../store/jsonStore'
import { profileStore } from '../store/profile'
import { stateStore } from '../store/state'
import { approvedFolderFor } from '../security/allowlist'
import { showChat } from '../windows/chatWindow'
import { getFloatWindow, setFloatExpanded } from '../windows/floatWindow'
import { forgetActiveWindow, pollActiveWindow } from './activeWindow'
import { countLooseFiles, downloadsDir, startDownloadsWatcher, stopDownloadsWatcher } from './downloads'

const POLL_MS = 10_000
const GAP_BETWEEN_OFFERS_MS = 5 * 60_000
const DISMISS_MS = 4 * 3600_000
const SNOOZE_MS = 15 * 60_000
const LONG_FOCUS_MS = 50 * 60_000
const MESSY_DOWNLOADS = 15
const MEETING_APPS = /zoom|teams|webex|facetime|google meet|skype|slack huddle/i
const SUMMARIZABLE = ['.txt', '.md', '.csv', '.json', '.log', '.html']

type Rule = 'new-download' | 'messy-downloads' | 'meeting' | 'long-focus'

interface LiveOffer extends Offer {
  rule: Rule
  /** Chat message sent when accepted. */
  message: string
}

let current: LiveOffer | null = null
let lastShownAt = 0
const silencedUntil = new Map<Rule, number>()
const snoozed: { offer: LiveOffer; at: number }[] = []
let pollTimer: NodeJS.Timeout | null = null

/** Hook the chat window uses to send accepted offers. Set by index.ts. */
let sendToChat: (text: string) => void = () => {}
export function setChatSender(fn: (text: string) => void): void {
  sendToChat = fn
}

function allowed(): boolean {
  const { enabled, quietMode } = stateStore.get()
  return enabled && !quietMode && profileStore.get().proactive
}

function offer(rule: Rule, text: string, acceptLabel: string, message: string): void {
  const now = Date.now()
  if (!allowed() || current) return
  if ((silencedUntil.get(rule) ?? 0) > now || now - lastShownAt < GAP_BETWEEN_OFFERS_MS) return
  show({ id: newId(), rule, text, acceptLabel, message })
}

function show(o: LiveOffer): void {
  const win = getFloatWindow()
  if (!win) return
  current = o
  lastShownAt = Date.now()
  setFloatExpanded(true)
  win.webContents.send('offer:show', { id: o.id, text: o.text, acceptLabel: o.acceptLabel })
}

function clear(): void {
  if (!current) return
  getFloatWindow()?.webContents.send('offer:clear', { id: current.id })
  setFloatExpanded(false)
  current = null
}

export function respondOffer(id: unknown, choice: unknown): void {
  if (!current || current.id !== id) return
  const o = current
  clear()
  if (choice === 'accept') {
    silencedUntil.set(o.rule, Date.now() + DISMISS_MS)
    if (stateStore.get().enabled) {
      showChat()
      sendToChat(o.message)
    }
  } else if (choice === 'snooze') {
    // The rule stays quiet until the snoozed offer comes back.
    silencedUntil.set(o.rule, Date.now() + SNOOZE_MS)
    snoozed.push({ offer: { ...o, id: newId() }, at: Date.now() + SNOOZE_MS })
  } else {
    silencedUntil.set(o.rule, Date.now() + DISMISS_MS)
  }
}

const downloadsApproved = (): boolean => approvedFolderFor(downloadsDir()) !== null

async function onNewDownload(path: string): Promise<void> {
  if (!allowed() || !downloadsApproved()) return
  const name = basename(path)
  if (SUMMARIZABLE.includes(extname(name).toLowerCase())) {
    offer('new-download', `New download: ${name}. Want a quick summary?`, 'Summarize', `Summarize ${path}`)
    return
  }
  const n = await countLooseFiles()
  if (n >= MESSY_DOWNLOADS) {
    offer('messy-downloads', `Downloads has ${n} loose files. Sort them into folders?`, 'Organize', `Organize ${downloadsDir()}`)
  }
}

async function poll(): Promise<void> {
  // Snoozed offers whose time has come.
  const due = snoozed.findIndex((s) => s.at <= Date.now())
  if (due >= 0 && allowed() && !current) show(snoozed.splice(due, 1)[0].offer)

  if (!allowed()) return
  const active = await pollActiveWindow()
  if (!active) return
  const label = `${active.app} ${active.title}`
  if (MEETING_APPS.test(label) || /\bmeeting\b/i.test(active.title)) {
    offer('meeting', 'Looks like you are in a meeting. Remind you to write notes in 30 minutes?', 'Remind me', 'Remind me to write my meeting notes in 30 minutes')
  } else if (Date.now() - active.since > LONG_FOCUS_MS && !/pai|electron/i.test(active.app)) {
    offer('long-focus', `You have been in ${active.app} for a while. Remind you to take a break in 10 minutes?`, 'Remind me', 'Remind me to take a short break in 10 minutes')
  }
}

/** Forget cooldowns, snoozes and the current offer (used by tests). */
export function resetProactiveState(): void {
  clear()
  current = null
  lastShownAt = 0
  silencedUntil.clear()
  snoozed.length = 0
}

/** Start or stop sources to match the current settings. Safe to call often. */
export function refreshProactive(): void {
  if (allowed()) {
    if (!pollTimer) pollTimer = setInterval(() => void poll(), POLL_MS)
    if (downloadsApproved()) startDownloadsWatcher((p) => void onNewDownload(p))
    else stopDownloadsWatcher()
  } else {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    stopDownloadsWatcher()
    forgetActiveWindow()
    clear()
  }
}
