import { describe, expect, it } from 'vitest'
import { DICTATION_RATE, Dictation } from '../src/shared/dictation'

describe('live editable dictation', () => {
  it('shows the live transcript after existing text', () => {
    const d = new Dictation(() => 0)
    d.start('Note:')
    expect(d.compose('buy milk', d.ticket())).toBe('Note: buy milk')
  })

  it('keeps user edits and only adds speech after the edit', () => {
    let t = 0
    const d = new Dictation(() => t)
    d.start('')
    d.userChanged(d.compose('remind me to by milk', d.ticket())!) // our own update: not an edit
    t = 3000
    d.userChanged('remind me to buy milk') // user fixes "by" -> "buy" at 3 s
    const audio = new Float32Array(DICTATION_RATE * 5)
    expect(d.segment(audio).length).toBe(DICTATION_RATE * 2) // only audio after the edit
    expect(d.compose('in ten minutes', d.ticket())).toBe('remind me to buy milk in ten minutes')
  })

  it('a transcription started before an edit never overwrites it', () => {
    const d = new Dictation(() => 0)
    d.start('')
    const ticket = d.ticket()
    d.userChanged('my fixed text')
    expect(d.compose('old wrong text', ticket)).toBeNull()
  })
})
