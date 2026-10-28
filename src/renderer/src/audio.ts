/**
 * audio.ts — microphone recording and spoken replies, in the browser layer.
 *
 * Recording: MediaRecorder captures the mic; when stopped, the audio is decoded
 * and resampled to mono 16 kHz Float32, which main transcribes locally (Whisper).
 * Speaking: either a natural local AI voice (Kokoro, generated in main) or the
 * OS's built-in voices via speechSynthesis. Both are offline after setup.
 */

import { DEFAULT_VOICE, type VoiceChoice } from '@shared/ipc'

export const MAX_RECORD_SECONDS = 60

export class Recorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private levelCtx: AudioContext | null = null
  private raf = 0

  /** Start recording. `onLevel` gets a 0..1 loudness value ~60 times a second. */
  async start(onLevel: (level: number) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream)
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.recorder.start(1000) // a chunk every second, so snapshot() can peek at the audio so far

    // Live level meter for the UI.
    this.levelCtx = new AudioContext()
    const analyser = this.levelCtx.createAnalyser()
    analyser.fftSize = 512
    this.levelCtx.createMediaStreamSource(this.stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    const loop = () => {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
      onLevel(Math.min(1, peak / 64))
      this.raf = requestAnimationFrame(loop)
    }
    loop()
  }

  /** Stop and return mono 16 kHz samples. */
  async stop(): Promise<Float32Array> {
    const rec = this.recorder
    if (!rec) throw new Error('Not recording.')
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.stop()
    await done
    this.cleanup()
    const blob = new Blob(this.chunks, { type: rec.mimeType })
    // An AudioContext at 16 kHz resamples while decoding.
    const ctx = new AudioContext({ sampleRate: 16_000 })
    try {
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer())
      return audio.getChannelData(0).slice()
    } finally {
      void ctx.close()
    }
  }

  /**
   * The audio recorded so far (for live captions), at most the last `maxSeconds`.
   * Returns null if there is nothing decodable yet.
   */
  async snapshot(maxSeconds = Infinity): Promise<Float32Array | null> {
    if (!this.recorder || this.chunks.length === 0) return null
    const blob = new Blob(this.chunks, { type: this.recorder.mimeType })
    const ctx = new AudioContext({ sampleRate: 16_000 })
    try {
      const audio = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0)
      return Number.isFinite(maxSeconds) ? audio.slice(Math.max(0, audio.length - maxSeconds * 16_000)) : audio.slice()
    } catch {
      return null // a half-written chunk; try again next time
    } finally {
      void ctx.close()
    }
  }

  cancel(): void {
    if (this.recorder?.state === 'recording') this.recorder.stop()
    this.cleanup()
  }

  private cleanup(): void {
    cancelAnimationFrame(this.raf)
    this.stream?.getTracks().forEach((t) => t.stop()) // turns the OS mic indicator off
    this.stream = null
    void this.levelCtx?.close()
    this.levelCtx = null
    this.recorder = null
  }
}

// ---------------------------------------------------------------------------
// Spoken replies
// ---------------------------------------------------------------------------

let voiceChoice: VoiceChoice = { ...DEFAULT_VOICE }
/** Bumped by stopSpeaking(): anything still playing or generating for an older value stops. */
let generation = 0
let playing: { ctx: AudioContext; src: AudioBufferSourceNode } | null = null

/** Called when the profile loads or changes. */
export function setVoiceChoice(v: VoiceChoice): void {
  voiceChoice = v
}

/** Novelty voices that come with macOS; never useful for reading replies. */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Junior|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Ralph|Fred|Kathy|Princess|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy)\b/

export interface SystemVoiceInfo {
  name: string
  lang: string
  quality: 'premium' | 'enhanced' | 'standard'
}

/** English OS voices worth using, best quality first. */
export function listSystemVoices(): SystemVoiceInfo[] {
  const rank = { premium: 0, enhanced: 1, standard: 2 }
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith('en') && v.localService && !NOVELTY.test(v.name))
    .map((v) => ({
      name: v.name,
      lang: v.lang,
      quality: /premium/i.test(v.name) ? ('premium' as const) : /enhanced/i.test(v.name) ? ('enhanced' as const) : ('standard' as const)
    }))
    .sort((a, b) => rank[a.quality] - rank[b.quality] || a.name.localeCompare(b.name))
}

/** Pick a natural-sounding local English voice if there is one. */
function pickVoice(name?: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices()
  if (name) {
    const exact = voices.find((v) => v.name === name)
    if (exact) return exact
  }
  const best = listSystemVoices()[0]
  return voices.find((v) => v.name === best?.name) ?? voices.find((v) => v.lang.startsWith('en'))
}

/** Make text pleasant to listen to: no URLs, no markdown symbols, not too long. */
function forSpeech(text: string): string {
  return text
    .replace(/^\(mock\)\s*/i, '')
    .replace(/```quiz[\s\S]*?(```|$)/g, ' Here is your quiz. ') // the quiz is clicked, not read out
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [title](url) -> title
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[*_#`>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500)
}

/** Split into sentences (and keep chunks short) so speech can start quickly. */
function sentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text]
  const out: string[] = []
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    const last = out[out.length - 1]
    if (last && last.length + p.length < 120) out[out.length - 1] = `${last} ${p}`
    else out.push(p)
  }
  return out
}

function speakSystem(text: string, choice: VoiceChoice, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    const voice = pickVoice(choice.engine === 'system' ? choice.voice : undefined)
    if (voice) u.voice = voice
    u.rate = choice.rate
    // Safety net: some engines never fire "end"; ~14 characters per second is generous.
    const timer = setTimeout(resolve, 3000 + (text.length / 14) * 1000)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    u.onend = done
    u.onerror = done
    speechSynthesis.speak(u)
  })
}

function playPcm(audio: Float32Array, sampleRate: number, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve()
    const ctx = new AudioContext()
    const buffer = ctx.createBuffer(1, audio.length, sampleRate)
    buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.onended = () => {
      if (playing?.src === src) playing = null
      void ctx.close()
      resolve()
    }
    playing = { ctx, src }
    src.start()
  })
}

/** Natural voice: generate the next sentence while the current one plays. */
async function speakNatural(text: string, choice: VoiceChoice, gen: number): Promise<void> {
  const chunks = sentences(text)
  const make = (i: number) => (i < chunks.length ? window.pai.synthesize(chunks[i], choice.voice, choice.rate) : null)
  let next = make(0)
  for (let i = 0; i < chunks.length && next; i++) {
    const res = await next
    if (gen !== generation) return
    next = make(i + 1)
    if (!res.ok) {
      // e.g. offline on first use: finish this reply with the system voice instead.
      await speakSystem(chunks.slice(i).join(' '), { ...choice, engine: 'system', voice: '' }, gen)
      return
    }
    await playPcm(res.value.audio, res.value.sampleRate, gen)
  }
}

/** Speak and wait until finished (or stopped). `choice` overrides the saved voice (previews). */
export async function speakAsync(text: string, choice: VoiceChoice = voiceChoice): Promise<void> {
  stopSpeaking()
  const gen = generation
  const clean = forSpeech(text)
  if (!clean) return
  if (choice.engine === 'natural') await speakNatural(clean, choice, gen)
  else await speakSystem(clean, choice, gen)
}

export function speak(text: string): void {
  void speakAsync(text)
}

/** A short two-tone chime: "I'm listening" (up) or "done" (down). */
export function chime(kind: 'start' | 'end' = 'start'): void {
  try {
    const ctx = new AudioContext()
    const notes = kind === 'start' ? [660, 880] : [880, 560]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.11
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.18)
    })
    setTimeout(() => void ctx.close(), 600)
  } catch {
    /* no audio output; not important */
  }
}

export function stopSpeaking(): void {
  generation++
  speechSynthesis.cancel()
  try {
    playing?.src.stop()
  } catch {
    /* already stopped */
  }
  playing = null
}

// Voices load asynchronously in Chromium; touching the list early warms it up.
if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices()
