import { describe, expect, it } from 'vitest'
import { sanitizeProfile } from '../src/main/store/profile'

describe('profile voice settings', () => {
  it('defaults to the natural "Heart" voice', () => {
    expect(sanitizeProfile({}).voice).toEqual({ engine: 'natural', voice: 'af_heart', rate: 1 })
  })

  it('keeps valid choices and repairs bad ones', () => {
    expect(sanitizeProfile({ voice: { engine: 'natural', voice: 'bf_emma', rate: 1.1 } }).voice).toEqual({ engine: 'natural', voice: 'bf_emma', rate: 1.1 })
    expect(sanitizeProfile({ voice: { engine: 'natural', voice: 'not-a-voice', rate: 9 } }).voice).toEqual({ engine: 'natural', voice: 'af_heart', rate: 1.3 })
    expect(sanitizeProfile({ voice: { engine: 'system', voice: 'Ava (Premium)', rate: 0.1 } }).voice).toEqual({ engine: 'system', voice: 'Ava (Premium)', rate: 0.8 })
  })
})
