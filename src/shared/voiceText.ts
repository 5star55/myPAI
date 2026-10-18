/**
 * voiceText.ts — understanding short spoken phrases (pure functions, easy to test).
 *
 * Speech recognition often mishears short names ("pai" -> "pie", "bye", "pi"),
 * so wake-word matching is forgiving: a few known sound-alikes, and for longer
 * names, one letter of difference is allowed.
 */

/** Lowercase, no punctuation, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Levenshtein distance (number of single-letter edits). */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

const SOUND_ALIKES: Record<string, string[]> = {
  pai: ['pie', 'pi', 'pay', 'pye', 'py', 'bye', 'pa', 'pal', 'paii']
}

function isName(word: string, name: string): boolean {
  if (word === name) return true
  if (SOUND_ALIKES[name]?.includes(word)) return true
  return name.length >= 4 && editDistance(word, name) <= 1
}

/** "Hey" and how speech recognition sometimes hears it. */
const HEY = ['hey', 'hay', 'hei', 'heh', 'a']

/**
 * Does the transcript start with the wake phrase "Hey <name>"?
 * (<name> is the assistant's name from the profile, so renaming it changes the wake word.)
 * Returns null if not, otherwise the command after it ('' if only the wake phrase was said).
 */
export function matchWake(transcript: string, assistantName: string): string | null {
  const words = normalize(transcript).split(' ').filter(Boolean)
  const nameWords = normalize(assistantName).split(' ').filter(Boolean)
  if (nameWords.length === 0 || words.length < 2) return null
  // "Hey" must come first (allowing one filler word before it, e.g. "oh hey nova").
  const heyAt = HEY.includes(words[0]) ? 0 : HEY.includes(words[1]) ? 1 : -1
  if (heyAt < 0) return null
  // Then the full name ("hey nova", or "hey nova star" for a two-word name).
  const after = words.slice(heyAt + 1)
  if (after.length < nameWords.length) return null
  if (!nameWords.every((n, i) => isName(after[i], n))) return null
  return after.slice(nameWords.length).join(' ')
}

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|allow|confirm|correct|affirmative|of course|absolutely)\b/
const NO = /^(no|nope|nah|don't|do not|stop|cancel|deny|never|negative|wait)\b/

/** Interpret a spoken answer to a yes/no question. */
export function parseYesNo(transcript: string): 'yes' | 'no' | null {
  const t = normalize(transcript)
  if (NO.test(t)) return 'no'
  if (YES.test(t)) return 'yes'
  return null
}

/** Phrases that end a hands-free conversation. */
export function isGoodbye(transcript: string): boolean {
  return /^(thanks?( you)?|thank you|that's all|that is all|bye|goodbye|never ?mind|stop|cancel)\b/.test(normalize(transcript))
}

/** A short version of a reply for the orb's caption. */
export function shortCaption(text: string, max = 90): string {
  const clean = text.replace(/^\(mock\)\s*/i, '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
