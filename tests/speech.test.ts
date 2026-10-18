import { describe, expect, it } from 'vitest'
import { SAMPLE_RATE, loudness, transcribe } from '../src/main/speech'

describe('voice input guards', () => {
  it('measures loudness', () => {
    expect(loudness(new Float32Array(SAMPLE_RATE))).toBe(0)
    const tone = Float32Array.from({ length: SAMPLE_RATE }, (_, i) => 0.3 * Math.sin(i / 5))
    expect(loudness(tone)).toBeGreaterThan(0.1)
  })

  it('rejects silence, bad input, too short and too long recordings without loading the model', async () => {
    expect((await transcribe(new Float32Array(SAMPLE_RATE))).ok).toBe(false) // silence
    expect((await transcribe([1, 2, 3])).ok).toBe(false) // not audio
    expect((await transcribe(new Float32Array(100))).ok).toBe(false) // too short
    expect((await transcribe(new Float32Array(SAMPLE_RATE * 61))).ok).toBe(false) // too long
  })
})
