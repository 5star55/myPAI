import { describe, expect, it } from 'vitest'
import { parseWhen } from '../src/shared/when'

const now = new Date('2026-10-18T18:40:00')
const at = (text: string) => parseWhen(text, now)
const plus = (ms: number) => new Date(now.getTime() + ms).getTime()

describe('reminder times', () => {
  it('relative times, including seconds', () => {
    expect(at('push my code in 30 seconds')).toEqual({ at: new Date(plus(30_000)), rest: 'push my code' })
    expect(at('brush teeth in 2 minutes')?.at.getTime()).toBe(plus(120_000))
    expect(at('in an hour')?.at.getTime()).toBe(plus(3_600_000))
    expect(at('call mom in half an hour')).toMatchObject({ rest: 'call mom' })
    expect(at('stretch in ten mins')?.at.getTime()).toBe(plus(600_000))
  })

  it('clock times', () => {
    expect(at('at 5pm')?.at.getHours()).toBe(17)
    expect(at('meeting at 9:30 tomorrow')).toMatchObject({ rest: 'meeting' })
    expect(at('meeting at 9:30 tomorrow')?.at.getDate()).toBe(19)
    expect(at('at 17:30')?.at.getDate()).toBe(19) // already past today -> tomorrow
    expect(at('at 8')?.at.getHours()).toBe(20) // 8 with no am/pm in the evening -> 8pm
    expect(at('tomorrow')?.at.getHours()).toBe(9)
  })

  it('ISO dates and no time at all', () => {
    expect(at('2026-10-19T08:00')?.at.getHours()).toBe(8)
    expect(at('buy milk')).toBeNull()
  })
})
