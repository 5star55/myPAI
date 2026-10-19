import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { getSuggestions, resetSuggestIndex } from '../src/main/suggest'
import { TMP, makeFiles, useProfile } from './helpers'
import { homedir } from 'node:os'

const texts = async (input: string) => (await getSuggestions(input)).map((s) => s.text)

describe('live suggestions', () => {
  beforeAll(() => {
    makeFiles({
      'work/quarterly-report.txt': 'q3',
      'work/meeting-notes.md': 'notes',
      'work/photos/beach.jpg': 'x',
      'secret/report-secret.txt': 'nope'
    })
    useProfile(['work'])
    resetSuggestIndex()
  })

  it('finds files by partial name for "summarize"', async () => {
    const want = join(TMP, 'work/quarterly-report.txt')
const home = homedir()
const short = want.startsWith(home) ? '~' + want.slice(home.length) : want
const got = await texts('summarize report')
expect(got.some((t) => t === `Summarize ${want}` || t === `Summarize ${short}`)).toBe(true)
  })

  it('never suggests files outside the approved folders', async () => {
    const all = (await texts('summarize report')).join(' ')
    expect(all).not.toContain('secret')
  })

  it('completes reminders with times', async () => {
    const s = await getSuggestions('remind me to call mom')
    expect(s[0]).toMatchObject({ text: 'Remind me to call mom in 10 minutes', send: true })
  })

  it('suggests web searches and memories', async () => {
    expect(await texts('search for electron news')).toContain('Search the web for electron news')
    expect(await texts('remember I like tea')).toContain('Remember that I like tea')
  })

  it('rename/move fill the box instead of sending (you must finish them)', async () => {
    const s = await getSuggestions('rename meeting')
    expect(s[0]).toMatchObject({ send: false })
    expect(s[0].text).toMatch(/meeting-notes\.md to $/)
  })

  it('offers something useful for an empty box, and at most 4 chips', async () => {
    const s = await getSuggestions('')
    expect(s.length).toBeGreaterThan(0)
    expect(s.length).toBeLessThanOrEqual(4)
  })

  it('handles junk input safely', async () => {
    expect(await getSuggestions(42)).toBeInstanceOf(Array)
    expect(await getSuggestions('x'.repeat(10_000))).toBeInstanceOf(Array)
  })
})
