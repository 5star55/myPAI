/**
 * clean.ts — tidy text that comes from the web before showing it (or giving it
 * to the model). Search snippets often contain HTML tags, entities, citation
 * fragments and sentences cut off mid-way.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–' }

export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? (e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1)) || 32) : m))
}

/** Snippets that are really a bibliography ("10. Leung, K. K. … arXiv:2510…") say nothing useful. */
function looksLikeReferences(t: string): boolean {
  const refs = (t.match(/\b\d{1,3}\.\s+[A-Z][\w-]+,\s[A-Z]\./g) ?? []).length
  const ids = (t.match(/arXiv:|doi:|\bvol\.|\bpp\.|et al\./gi) ?? []).length
  return refs + ids >= 3
}

/** Clean a search-result snippet and cut it to about `max` characters at a sentence or word end. */
export function cleanSnippet(text: string, max = 260): string {
  // Judge only the part that would be shown (long pages often end with a reference list).
  if (looksLikeReferences(stripHtml(text).slice(0, max + 40))) return ''
  let t = stripHtml(text)
    .replace(/(^|\s)#{1,6}\s+/g, ' ') // markdown headings
    .replace(/\*\*|__|\|/g, ' ') // bold markers, table pipes
    .replace(/\[(Google Scholar|CrossRef|PubMed|Green Version|Ref\.?|Link|PDF)\]/gi, '')
    .replace(/(^|\s)\d{1,3}\.\s(?=[A-Z][a-z]+,\s[A-Z]\.)/g, ' ') // "10. Leung, K. K." reference-list numbers
    .replace(/\s+/g, ' ')
    .trim()
  // Snippets often start mid-sentence; mark them as an excerpt.
  if (/^[a-z,;:)]/.test(t) || /^\d{1,3}\.\s/.test(t)) t = `…${t.replace(/^\d{1,3}\.\s/, '')}`
  if (t.length <= max) return t
  t = t.slice(0, max)
  const sentenceEnd = Math.max(t.lastIndexOf('. '), t.lastIndexOf('? '), t.lastIndexOf('! '))
  if (sentenceEnd > max * 0.5) return t.slice(0, sentenceEnd + 1)
  return `${t.slice(0, t.lastIndexOf(' ') > 0 ? t.lastIndexOf(' ') : max).replace(/[,;:(\s]+$/, '')}…`
}

export function cleanTitle(text: string): string {
  return (
    stripHtml(text)
      .replace(/\s+/g, ' ')
      .replace(/([a-z]):(?=[A-Z])/g, '$1: ') // "Systems:Progress" -> "Systems: Progress"
      .trim()
      .slice(0, 160) || 'Untitled'
  )
}

/** "https://www.mdpi.com/2673/..." -> "mdpi.com" */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function isWebUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
