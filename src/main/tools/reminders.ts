/**
 * reminders.ts — set_reminder / list_reminders. The scheduler shows the notification.
 */
import { REPEATS, type Repeat } from '@shared/ipc'
import { addReminder, listReminders as all } from '../store/reminders'
import { ToolInputError, needString, optString, type Tool } from './types'

const MAX_AHEAD_MS = 366 * 24 * 3600_000

function parseWhen(args: Record<string, unknown>): Date {
  const minutes = Number(args.in_minutes)
  if (args.in_minutes !== undefined && Number.isFinite(minutes)) {
    if (minutes < 1 || minutes > 525_600) throw new ToolInputError('in_minutes must be between 1 and 525600.')
    return new Date(Date.now() + minutes * 60_000)
  }
  const at = optString(args, 'at')
  if (!at) throw new ToolInputError('Give either "in_minutes" or "at".')
  const t = Date.parse(at)
  if (Number.isNaN(t)) throw new ToolInputError(`"${at}" is not a date/time. Use ISO format like 2026-10-18T17:30.`)
  if (t < Date.now() - 60_000) throw new ToolInputError('That time is in the past.')
  if (t > Date.now() + MAX_AHEAD_MS) throw new ToolInputError('Reminders can be at most a year ahead.')
  return new Date(t)
}

export const setReminder: Tool = {
  name: 'set_reminder',
  description:
    'Set a reminder that shows a desktop notification. Use in_minutes for relative times, or at (ISO local date-time) for exact times. Optional repeat: hourly, daily, weekly.',
  permission: 'reminders',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'What to remind the user about' },
      in_minutes: { type: 'number', description: 'Minutes from now' },
      at: { type: 'string', description: 'Exact local time, ISO format, e.g. 2026-10-18T17:30' },
      repeat: { type: 'string', enum: [...REPEATS], description: 'none (default), hourly, daily or weekly' }
    },
    required: ['message']
  },
  prepare(args) {
    const message = needString(args, 'message', 200)
    const when = parseWhen(args)
    const rawRepeat = optString(args, 'repeat') ?? 'none'
    const repeat: Repeat = REPEATS.includes(rawRepeat as Repeat) ? (rawRepeat as Repeat) : 'none'
    const label = `"${message}" at ${when.toLocaleString()}${repeat !== 'none' ? `, repeating ${repeat}` : ''}`
    return {
      action: 'Set a reminder',
      target: label,
      run: async () => {
        addReminder(message, when, repeat)
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
