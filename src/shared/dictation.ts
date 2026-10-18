/**
 * dictation.ts — live, editable dictation in the message box.
 *
 * While the mic is on, the transcript of what you are saying is shown in the
 * box and updated every few seconds. You can edit it at any time:
 *   - your edited text becomes the new "base", and
 *   - only speech AFTER your edit is transcribed and added after it.
 * A transcription that was started before your edit is thrown away, so it can
 * never overwrite what you just fixed.
 */
export const DICTATION_RATE = 16_000

export function joinText(a: string, b: string): string {
  return [a.trim(), b.trim()].filter(Boolean).join(' ')
}

export class Dictation {
  private base = ''
  private cutSamples = 0
  private lastShown = ''
  private startedAt = 0
  private version = 0

  constructor(private readonly now: () => number = Date.now) {}

  /** Recording started; `existing` is whatever was already in the box. */
  start(existing: string): void {
    this.base = existing
    this.cutSamples = 0
    this.lastShown = existing
    this.startedAt = this.now()
    this.version++
  }

  /** The box changed. If it's not our own update, the user edited it. */
  userChanged(value: string): void {
    if (value === this.lastShown) return
    this.base = value
    this.lastShown = value
    this.cutSamples = Math.round(((this.now() - this.startedAt) / 1000) * DICTATION_RATE)
    this.version++
  }

  /** Take a ticket before transcribing; pass it back to compose(). */
  ticket(): number {
    return this.version
  }

  /** The part of the recording that belongs to the current (unedited) segment. */
  segment(fullAudio: Float32Array): Float32Array {
    return fullAudio.subarray(Math.min(this.cutSamples, fullAudio.length))
  }

  /**
   * Text for the box: base + transcript of the current segment.
   * Returns null if the user edited the box since `ticket` was taken.
   */
  compose(transcript: string, ticket: number): string | null {
    if (ticket !== this.version) return null
    this.lastShown = joinText(this.base, transcript)
    return this.lastShown
  }
}
