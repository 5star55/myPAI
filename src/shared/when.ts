/**
 * when.ts — understand times people (and models) write for reminders:
 *   "in 30 seconds", "in 2 minutes", "in an hour", "in half an hour",
 *   "at 5pm", "at 17:30", "tomorrow at 9am", "tomorrow", "2026-10-19T08:00".
 *
 * parseWhen() returns the time and the text with the time phrase removed
 * ("brush teeth in 2 minutes" -> "brush teeth"), or null if there is no time.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60
}
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }

function unitOf(word: string): number | null {
  const w = word.toLowerCase()
  if (/^(s|secs?|seconds?)$/.test(w)) return UNIT_MS.s
  if (/^(m|mins?|minutes?)$/.test(w)) return UNIT_MS.m
  if (/^(h|hrs?|hours?)$/.test(w)) return UNIT_MS.h
  if (/^(d|days?)$/.test(w)) return UNIT_MS.d
  return null
}

const tidy = (s: string) => s.replace(/\s{2,}/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').replace(/\b(to|for)$/i, '').trim()

export function parseWhen(text: string, now: Date = new Date()): { at: Date; rest: string } | null {
  const t = text.trim()

  // "in half an hour"
  let m = t.match(/\b(?:in|after)\s+half\s+an?\s+hour\b/i)
  if (m) return { at: new Date(now.getTime() + 30 * UNIT_MS.m), rest: tidy(t.replace(m[0], '')) }

  // "in 30 seconds", "in 2.5 minutes", "in an hour", "in 10 min"
  m = t.match(/\b(?:in|after)\s+(\d+(?:\.\d+)?|[a-z-]+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/i)
  if (m) {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1].toLowerCase()]
    const unit = unitOf(m[2])
    if (n && unit) return { at: new Date(now.getTime() + n * unit), rest: tidy(t.replace(m[0], '')) }
  }

  // "tomorrow at 9am", "at 5pm", "at 17:30", "today at 6", "tonight at 8"
  m = t.match(/\b(?:(today|tonight|tomorrow)\s+)?at\s+(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm|a\.m\.|p\.m\.))?(?:\s+(today|tonight|tomorrow))?\b/i)
  if (m) {
    const day = (m[1] ?? m[5] ?? '').toLowerCase()
    let hour = Number(m[2])
    const minute = Number(m[3] ?? 0)
    const ampm = (m[4] ?? '').toLowerCase().replace(/\./g, '')
    if (hour > 23 || minute > 59) return null
    if (ampm === 'pm' && hour < 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0
    if (!ampm && day === 'tonight' && hour < 12) hour += 12
    const at = new Date(now)
    at.setHours(hour, minute, 0, 0)
    if (day === 'tomorrow') at.setDate(at.getDate() + 1)
    // "at 5" with no am/pm and already past: assume the next 5 o'clock (pm), else tomorrow.
    else if (at <= now) {
      if (!ampm && hour < 12 && hour + 12 > now.getHours()) at.setHours(hour + 12)
      else at.setDate(at.getDate() + 1)
    }
    return { at, rest: tidy(t.replace(m[0], '')) }
  }

  // "tomorrow" alone -> 9am tomorrow
  m = t.match(/\btomorrow\b/i)
  if (m) {
    const at = new Date(now)
    at.setDate(at.getDate() + 1)
    at.setHours(9, 0, 0, 0)
    return { at, rest: tidy(t.replace(m[0], '')) }
  }

  // ISO / anything Date understands ("2026-10-19T08:00")
  if (/\d{4}-\d{2}-\d{2}/.test(t)) {
    const ms = Date.parse(t)
    if (!Number.isNaN(ms)) return { at: new Date(ms), rest: '' }
  }
  return null
}
