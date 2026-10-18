/**
 * scheduler.ts — checks reminders every 15 seconds and shows native notifications.
 * Missed reminders (e.g. the PC was asleep) fire once when the app is back,
 * and repeating ones skip ahead to the next future time.
 */
import { Notification } from 'electron'
import type { Reminder, Repeat } from '@shared/ipc'
import { profileStore } from '../store/profile'
import { listReminders, replaceReminders } from '../store/reminders'
import { showChat } from '../windows/chatWindow'
import { broadcast } from '../windows/common'

const TICK_MS = 15_000
const STEP_MS: Record<Exclude<Repeat, 'none'>, number> = {
  hourly: 3600_000,
  daily: 24 * 3600_000,
  weekly: 7 * 24 * 3600_000
}

function notify(r: Reminder): void {
  if (!Notification.isSupported()) return console.log(`[reminder] ${r.message}`)
  const n = new Notification({ title: `${profileStore.get().assistantName} reminder`, body: r.message })
  n.on('click', () => showChat())
  n.show()
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
    notify(r)
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
}

export function startReminderScheduler(): void {
  tick()
  setInterval(() => tick(), TICK_MS)
}
