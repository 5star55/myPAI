/**
 * markdown.ts — a tiny, SAFE formatter for assistant replies.
 *
 * It turns text into a list of blocks and inline pieces (never HTML), so the
 * UI renders them as React elements and model output can't inject markup.
 * Supports: headings (#), bullet and numbered lists, **bold**, *italic*,
 * `code`, [links](https://...) and bare https:// links.
 */
import { isWebUrl } from './clean'

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string }

export type Block =
  | { type: 'heading'; inline: Inline[] }
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\*[^*\n]+\*|_[^_\n]+_)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const token = m[0]
    const at = m.index ?? 0
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) })
    last = at + token.length
    if (token.startsWith('**')) out.push({ type: 'bold', text: token.slice(2, -2) })
    else if (token.startsWith('`')) out.push({ type: 'code', text: token.slice(1, -1) })
    else if (token.startsWith('[')) {
      const lm = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (lm && isWebUrl(lm[2])) out.push({ type: 'link', text: lm[1], url: lm[2] })
      else out.push({ type: 'text', text: token })
    } else if (token.startsWith('http')) {
      if (isWebUrl(token)) out.push({ type: 'link', text: token.replace(/^https?:\/\/(www\.)?/, ''), url: token })
      else out.push({ type: 'text', text: token })
    } else out.push({ type: 'italic', text: token.slice(1, -1) })
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let para: Inline[][] = []
  let list: { ordered: boolean; items: Inline[][] } | null = null
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', lines: para })
    if (list) blocks.push({ type: 'list', ...list })
    para = []
    list = null
  }
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    const numbered = line.match(/^\s*\d{1,3}[.)]\s+(.*)$/)
    if (!line.trim()) flush()
    else if (heading) {
      flush()
      blocks.push({ type: 'heading', inline: parseInline(heading[1]) })
    } else if (bullet || numbered) {
      const ordered = !!numbered
      if (para.length || (list && list.ordered !== ordered)) flush()
      list ??= { ordered, items: [] }
      list.items.push(parseInline((bullet ?? numbered)![1]))
    } else if (list && /^\s{2,}/.test(raw)) {
      // Indented continuation of a list item.
      list.items[list.items.length - 1].push({ type: 'text', text: ' ' }, ...parseInline(line.trim()))
    } else {
      if (list) flush()
      para.push(parseInline(line))
    }
  }
  flush()
  return blocks
}
