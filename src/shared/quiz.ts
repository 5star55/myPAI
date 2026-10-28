/**
 * quiz.ts — the interactive quiz format.
 *
 * The assistant writes a quiz as a fenced block the chat turns into clickable cards:
 *
 *   ```quiz
 *   {"title": "Photosynthesis", "questions": [
 *     {"question": "What gas do plants take in?", "options": ["Oxygen", "Carbon dioxide", "Nitrogen"],
 *      "answer": 1, "explanation": "Plants use CO2 and water to make glucose."}
 *   ]}
 *   ```
 *
 * Everything is checked here and shown as plain text, never HTML.
 * `answer` may be the option's index (0-based), its letter ("B") or its exact text.
 */
export interface QuizQuestion {
  question: string
  options: string[]
  /** Index of the right option. */
  answer: number
  explanation: string
}

export interface Quiz {
  title: string
  questions: QuizQuestion[]
}

const MAX_QUESTIONS = 25
const MAX_OPTIONS = 6

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function answerIndex(raw: unknown, options: string[]): number {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw
  if (typeof raw !== 'string') return -1
  const t = raw.trim()
  if (/^[A-Fa-f]$/.test(t)) return t.toUpperCase().charCodeAt(0) - 65
  if (/^\d+$/.test(t)) return Number(t)
  return options.findIndex((o) => o.toLowerCase() === t.toLowerCase())
}

/**
 * A quiz still being written: the title and every question object that is already
 * complete, so the first questions can be answered while the rest arrive.
 */
export function parsePartialQuiz(source: string): Quiz | null {
  const start = source.indexOf('[', source.indexOf('"questions"'))
  if (start < 0) return null
  const done: string[] = []
  let depth = 0
  let from = -1
  let inString = false
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{' && depth++ === 0) from = i
    else if (c === '}' && --depth === 0) done.push(source.slice(from, i + 1))
  }
  const title = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(source.slice(0, start))?.[1] ?? ''
  return done.length ? parseQuiz(JSON.stringify({ title: safeJson(`"${title}"`) ?? '', questions: done.map(safeJson).filter(Boolean) })) : null
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** The quiz in a ```quiz block, or null if it isn't a valid one. */
export function parseQuiz(source: string): Quiz | null {
  const raw = safeJson(source)
  if (raw === null) return null
  const obj = Array.isArray(raw) ? { questions: raw } : raw
  if (typeof obj !== 'object' || obj === null || !Array.isArray((obj as { questions?: unknown }).questions)) return null
  const questions: QuizQuestion[] = []
  for (const q of (obj as { questions: unknown[] }).questions.slice(0, MAX_QUESTIONS)) {
    if (typeof q !== 'object' || q === null) continue
    const r = q as Record<string, unknown>
    const question = text(r.question ?? r.q, 1000)
    const options = (Array.isArray(r.options) ? r.options : []).map((o) => text(o, 300)).filter(Boolean).slice(0, MAX_OPTIONS)
    const answer = answerIndex(r.answer, options)
    if (!question || options.length < 2 || answer < 0 || answer >= options.length) continue
    questions.push({ question, options, answer, explanation: text(r.explanation, 1500) })
  }
  if (!questions.length) return null
  return { title: text((obj as { title?: unknown }).title, 120) || 'Quiz', questions }
}
