/**
 * reminders.ts — stored reminders (reminders.json). The scheduler fires them.
 */
import { REPEATS, type Reminder, type Repeat } from '@shared/ipc'
import { dataFile } from '../paths'
import { JsonStore, isObj, newId, str } from './jsonStore'

const store = new JsonStore<Reminder[]>(
  () => dataFile('reminders.json'),
  () => [],
  (raw) =>
    Array.isArray(raw)
      ? raw
          .filter(isObj)
          .filter((r) => !Number.isNaN(Date.parse(str(r.nextAt))))
          .map((r) => ({
            id: str(r.id) || newId(),
            message: str(r.message).slice(0, 200),
            nextAt: str(r.nextAt),
            repeat: REPEATS.includes(r.repeat as Repeat) ? (r.repeat as Repeat) : 'none',
            createdAt: str(r.createdAt, new Date().toISOString())
          }))
      : []
)

export const listReminders = (): Reminder[] => [...store.get()].sort((a, b) => a.nextAt.localeCompare(b.nextAt))

export function addReminder(message: string, nextAt: Date, repeat: Repeat): Reminder {
  const r: Reminder = { id: newId(), message, nextAt: nextAt.toISOString(), repeat, createdAt: new Date().toISOString() }
  store.update((all) => [...all, r])
  return r
}

export function deleteReminder(id: unknown): void {
  store.update((all) => all.filter((r) => r.id !== id))
}

export function replaceReminders(all: Reminder[]): void {
  store.set(all)
}
