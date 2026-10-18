/**
 * reminders.ts — set_reminder / list_reminders. The scheduler shows the notification.
 */
import { REPEATS, type Repeat } from '@shared/ipc'
import { parseWhen as parseWhenText } from '@shared/when'
import { scheduleNextReminder } from '../reminders/scheduler'
import { addReminder, listReminders as all } from '../store/reminders'
import { ToolInputError, needString, optString, type Tool } from './types'

const MAX_AHEAD_MS = 366 * 24 * 3600_000

const MIN_AHEAD_MS = 5_000

function checkRange(t: number): Date {
  if (Number.isNaN(t)) throw new ToolInputError('That is not a time I understand. Try "in 10 minutes" or "at 5pm".')
  if (t < Date.now() - 60_000) throw new ToolInputError('That time is in the past.')
  if (t > Date.now() + MAX_AHEAD_MS) throw new ToolInputError('Reminders can be at most a year ahead.')
  return new Date(Math.max(t, Date.now() + MIN_AHEAD_MS))
}

/**
 * When to remind, from (in order): in_seconds, in_minutes, at ("5pm", "17:30",
 * "tomorrow 9am", ISO), or — if the model left them out — a time written in the
 * message itself ("brush teeth in 2 minutes"). Returns the cleaned message too.
 */
export function parseWhen(args: Record<string, unknown>, message: string): { when: Date; message: string } {
  const seconds = Number(args.in_seconds)
  if (args.in_seconds !== undefined && Number.isFinite(seconds) && seconds > 0) {
    return { when: checkRange(Date.now() + seconds * 1000), message }
  }
  const minutes = Number(args.in_minutes)
  if (args.in_minutes !== undefined && Number.isFinite(minutes) && minutes > 0) {
    return { when: checkRange(Date.now() + minutes * 60_000), message }
  }
  const at = optString(args, 'at')
  if (at) {
    const parsed = parseWhenText(/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(at) ? `at ${at}` : at)
    return { when: checkRange(parsed ? parsed.at.getTime() : Date.parse(at)), message }
  }
  const fromText = parseWhenText(message)
  if (fromText) return { when: checkRange(fromText.at.getTime()), message: fromText.rest || message }
  throw new ToolInputError('When? Give in_minutes, in_seconds, or at (e.g. "5pm", "17:30", "tomorrow 9am").')
}

export const setReminder: Tool = {
  name: 'set_reminder',
  description:
    'Set a reminder (shows a notification and a card on the floating orb, with a chime). For relative times use in_seconds or in_minutes; for clock times use at, e.g. "5pm", "17:30", "tomorrow 9am". Optional repeat: hourly, daily, weekly.',
  permission: 'reminders',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'What to remind the user about' },
      in_seconds: { type: 'number', description: 'Seconds from now (e.g. 30)' },
      in_minutes: { type: 'number', description: 'Minutes from now (e.g. 10)' },
      at: { type: 'string', description: 'Clock time, e.g. "5pm", "17:30", "tomorrow 9am" or ISO 2026-10-18T17:30' },
      repeat: { type: 'string', enum: [...REPEATS], description: 'none (default), hourly, daily or weekly' }
    },
    required: ['message']
  },
  prepare(args) {
    const parsed = parseWhen(args, needString(args, 'message', 200))
    const { when } = parsed
    const message = parsed.message
    const rawRepeat = optString(args, 'repeat') ?? 'none'
    const repeat: Repeat = REPEATS.includes(rawRepeat as Repeat) ? (rawRepeat as Repeat) : 'none'
    const label = `"${message}" at ${when.toLocaleString()}${repeat !== 'none' ? `, repeating ${repeat}` : ''}`
    return {
      action: 'Set a reminder',
      target: label,
      run: async () => {
        addReminder(message, when, repeat)
        scheduleNextReminder()
        return `Reminder set: ${label}.`
      }
    }
  }
}

export const listRemindersTool: Tool = {
  name: 'list_reminders',
  description: 'List the reminders that are currently scheduled.',
  permission: 'reminders',
  parameters: { type: 'object', properties: {}, required: [] },
  prepare() {
    return {
      action: 'Read your reminders',
      target: 'scheduled reminders',
      run: async () => {
        const list = all()
        if (list.length === 0) return 'No reminders are scheduled.'
        return list.map((r) => `- ${r.message} — ${new Date(r.nextAt).toLocaleString()}${r.repeat !== 'none' ? ` (${r.repeat})` : ''}`).join('\n')
      }
    }
  }
}
