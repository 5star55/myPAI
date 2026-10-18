/**
 * scheduler.ts — fires reminders on time.
 *
 * A precise timer is set for the next reminder (plus a 30 s safety check, for
 * sleep/wake). When one is due:
 *   - a native notification (with sound), and
 *   - a "reminder:fired" event: the floating orb shows a card with Done /
 *     Snooze, plays a chime, and the main window reads it aloud. This works even
 *     when the OS blocks or silences notifications.
 * Missed reminders (e.g. the computer was asleep) fire once when it's back;
 * repeating ones then skip ahead to the next future time.
 */
import { Notification } from 'electron'
import type { Reminder, Repeat } from '@shared/ipc'
import { profileStore } from '../store/profile'
import { addReminder, listReminders, replaceReminders } from '../store/reminders'
import { showChat } from '../windows/chatWindow'
import { broadcast } from '../windows/common'

const SAFETY_TICK_MS = 30_000
const MAX_TIMER_MS = 2_147_000_000 // setTimeout's limit (~24.8 days)
export const SNOOZE_MINUTES = 10

const STEP_MS: Record<Exclude<Repeat, 'none'>, number> = {
  hourly: 3600_000,
  daily: 24 * 3600_000,
  weekly: 7 * 24 * 3600_000
}

let timer: NodeJS.Timeout | null = null

/** Show a native notification. Returns false if the OS doesn't support them. */
export function notify(title: string, body: string): boolean {
  if (!Notification.isSupported()) return false
  const n = new Notification({ title, body, sound: 'Glass', urgency: 'critical', timeoutType: 'never' })
  n.on('click', () => showChat())
  n.show()
  return true
}

function fire(r: Reminder): void {
  const name = profileStore.get().assistantName
  console.log(`[reminder] ${r.message}`)
  notify(`${name} reminder`, r.message)
  broadcast('reminder:fired', { id: r.id, message: r.message })
}

export function tick(now = Date.now()): void {
  const all = listReminders()
  let changed = false
  const next: Reminder[] = []
  for (const r of all) {
    if (Date.parse(r.nextAt) > now) {
      next.push(r)
      continue
    }
    changed = true
    fire(r)
    if (r.repeat !== 'none') {
      let t = Date.parse(r.nextAt)
      while (t <= now) t += STEP_MS[r.repeat]
      next.push({ ...r, nextAt: new Date(t).toISOString() })
    }
  }
  if (changed) {
    replaceReminders(next)
    broadcast('data:changed', { what: 'reminders' })
  }
  scheduleNextReminder()
}

/** (Re)arm the timer for the earliest reminder. Call after adding or deleting one. */
export function scheduleNextReminder(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const soonest = listReminders()[0]
  if (!soonest) return
  const delay = Math.min(MAX_TIMER_MS, Math.max(0, Date.parse(soonest.nextAt) - Date.now()))
  timer = setTimeout(() => tick(), delay)
}

/** "Snooze" on the reminder card. */
export function snoozeReminder(message: unknown, minutes = SNOOZE_MINUTES): void {
  if (typeof message !== 'string' || !message.trim()) return
  addReminder(message.slice(0, 200), new Date(Date.now() + minutes * 60_000), 'none')
  broadcast('data:changed', { what: 'reminders' })
  scheduleNextReminder()
}

export function startReminderScheduler(): void {
  tick()
  setInterval(() => tick(), SAFETY_TICK_MS)
}
