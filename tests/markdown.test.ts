import { describe, expect, it } from 'vitest'
import { cleanSnippet, cleanTitle, siteName } from '../src/shared/clean'
import { parseBlocks, parseInline } from '../src/shared/markdown'
import { toResults } from '../src/main/tools/web'

describe('reply formatting', () => {
  it('parses bold, code and links', () => {
    expect(parseInline('Use **this** and `code` at https://example.com/a.')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'bold', text: 'this' },
      { type: 'text', text: ' and ' },
      { type: 'code', text: 'code' },
      { type: 'text', text: ' at ' },
      { type: 'link', text: 'example.com/a', url: 'https://example.com/a' },
      { type: 'text', text: '.' }
    ])
  })

  it('never makes javascript: or other unsafe links clickable', () => {
    expect(parseInline('[click](javascript:alert(1))').every((p) => p.type !== 'link')).toBe(true)
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ type: 'text', text: '<script>alert(1)</script>' }])
  })

  it('keeps fenced code exactly as written (the "teach me python" bug)', () => {
    const blocks = parseBlocks('Here you go:\n\n```python\n# Print a greeting\nif x:\n    print("hi")\n```\nThat is it.')
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'code', 'paragraph'])
    expect(blocks[1]).toEqual({ type: 'code', lang: 'python', text: '# Print a greeting\nif x:\n    print("hi")' })
  })

  it('shows an unclosed code block (still streaming) as code', () => {
    expect(parseBlocks('```js\nconst a = 1')).toEqual([{ type: 'code', lang: 'js', text: 'const a = 1' }])
  })

  it('parses lists and headings', () => {
    const blocks = parseBlocks('## Top picks\n1. First\n2. Second\n\n- a\n- b\nDone.')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list', 'list', 'paragraph'])
    expect(blocks[1]).toMatchObject({ ordered: true })
  })
})

describe('web result cleaning', () => {
  it('strips HTML and citation junk, and trims long snippets', () => {
    expect(cleanTitle('<em>Index</em>-<em>RAG</em>: Storing &amp; Searching')).toBe('Index-RAG: Storing & Searching')
    const s = cleanSnippet('Errors in RAG systems [Google Scholar] [CrossRef] 11. VectifyAI, PageIndex. ' + 'More words here. '.repeat(30))
    expect(s).not.toContain('[Google Scholar]')
    expect(s.length).toBeLessThanOrEqual(261)
    expect(siteName('https://www.mdpi.com/2673/6/9/226')).toBe('mdpi.com')
  })

  it('hides bibliography-style snippets and fixes squashed titles', () => {
    expect(cleanSnippet('10. Leung, K. K. "Classifying Errors," arXiv:2510.13975. 2025. 11. VectifyAI, PageIndex. 12. OpenAI, Model Card. arXiv:2508.10925')).toBe('')
    expect(cleanTitle('RAG Systems:Progress, Gaps')).toBe('RAG Systems: Progress, Gaps')
    expect(cleanSnippet('articles and proceedings were reviewed.')).toBe('…articles and proceedings were reviewed.')
    // A good snippet stays, even if the page ends with references.
    const good = 'This review follows a structured methodology to examine RAG in healthcare. ' + 'x '.repeat(200) + ' 10. Leung, K. K. arXiv:1 11. Smith, J. arXiv:2'
    expect(cleanSnippet(good)).toMatch(/^This review follows/)
    expect(cleanSnippet('### The Power of Noise: **RAG** Systems')).toBe('The Power of Noise: RAG Systems')
    expect(cleanSnippet('Smith et al. found that RAG helps.')).toBe('Smith et al. found that RAG helps.') // one citation is fine
  })

  it('drops results without a valid web link', () => {
    const r = toResults([{ title: 'ok', url: 'https://a.com', content: 'x' }, { title: 'bad', url: 'javascript:1' }, { title: 'none' }])
    expect(r.map((x) => x.site)).toEqual(['a.com'])
  })
})
