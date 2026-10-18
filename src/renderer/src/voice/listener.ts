/**
 * listener.ts — hands-free microphone with voice activity detection (VAD).
 *
 * It keeps the mic open and measures loudness every ~85 ms. When loudness
 * rises well above the room's background noise, an "utterance" starts; when
 * it stays quiet for a moment, the utterance ends. The audio is resampled to
 * 16 kHz mono for Whisper. Nothing is stored; samples live only in memory.
 */

const TARGET_RATE = 16_000
const FRAME = 4096 // samples per processing step (~85 ms at 48 kHz)
const PRE_ROLL_MS = 350 // keep a little audio from before speech started
const END_SILENCE_MS = 1100 // this much quiet ends an utterance
const MIN_SPEECH_MS = 350
const MAX_UTTERANCE_MS = 15_000

export class VoiceListener {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: ScriptProcessorNode | null = null
  private noise = 0.005 // running estimate of background loudness
  private paused = false
  private frames: Float32Array[] = []
  private preRoll: Float32Array[] = []
  private speaking = false
  private speechMs = 0
  private silenceMs = 0
  private waiters: ((audio: Float32Array | null) => void)[] = []
  private onUtterance: ((audio: Float32Array) => void) | null = null
  /** Called with 0..1 loudness for the UI. */
  onLevel: (level: number) => void = () => {}

  get isOpen(): boolean {
    return !!this.ctx
  }

  /** Is someone talking right now? */
  get isSpeaking(): boolean {
    return this.speaking
  }

  /** The utterance so far (for live captions), or null if nobody is talking. */
  async peek(): Promise<Float32Array | null> {
    if (!this.speaking || !this.ctx || this.frames.length === 0) return null
    return resample(concat(this.frames), this.ctx.sampleRate)
  }

  async open(): Promise<void> {
    if (this.ctx) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    this.ctx = new AudioContext()
    const source = this.ctx.createMediaStreamSource(this.stream)
    // ScriptProcessor is old but simple and works everywhere in Electron.
    this.node = this.ctx.createScriptProcessor(FRAME, 1, 1)
    this.node.onaudioprocess = (e) => this.process(e.inputBuffer.getChannelData(0))
    source.connect(this.node)
    this.node.connect(this.ctx.destination) // required for processing to run (outputs silence)
  }

  close(): void {
    this.node?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop()) // turns the OS mic indicator off
    void this.ctx?.close()
    this.ctx = null
    this.stream = null
    this.node = null
    this.reset()
    for (const w of this.waiters.splice(0)) w(null)
  }

  /** Ignore the mic (e.g. while pai is speaking, so it doesn't hear itself). */
  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) this.reset()
  }

  /** Continuous mode: call `fn` for every utterance. */
  setUtteranceHandler(fn: ((audio: Float32Array) => void) | null): void {
    this.onUtterance = fn
  }

  /** Wait for the next utterance. Resolves null if nobody starts talking within `timeoutMs`. */
  listenOnce(timeoutMs: number): Promise<Float32Array | null> {
    return new Promise((resolve) => {
      const waiter = (audio: Float32Array | null) => {
        clearTimeout(timer)
        resolve(audio)
      }
      const timer = setTimeout(() => {
        // Only give up if the person hasn't started speaking.
        if (this.speaking) return
        this.waiters = this.waiters.filter((w) => w !== waiter)
        resolve(null)
      }, timeoutMs)
      this.waiters.push(waiter)
    })
  }

  /** Stop waiting (e.g. the user cancelled). */
  cancelWaiting(): void {
    for (const w of this.waiters.splice(0)) w(null)
    this.reset()
  }

  private reset(): void {
    this.frames = []
    this.preRoll = []
    this.speaking = false
    this.speechMs = 0
    this.silenceMs = 0
  }

  private process(input: Float32Array): void {
    if (!this.ctx) return
    const frame = new Float32Array(input) // copy: the browser reuses the buffer
    let sum = 0
    for (const v of frame) sum += v * v
    const rms = Math.sqrt(sum / frame.length)
    this.onLevel(Math.min(1, rms * 12))
    if (this.paused) return

    const ms = (frame.length / this.ctx.sampleRate) * 1000
    const threshold = Math.max(0.012, this.noise * 3)
    const loud = rms > threshold

    if (!this.speaking) {
      // Slowly learn the background noise level while nobody is talking.
      this.noise = this.noise * 0.95 + Math.min(rms, 0.05) * 0.05
      this.preRoll.push(frame)
      while (this.preRoll.length * ms > PRE_ROLL_MS) this.preRoll.shift()
      if (loud) {
        this.speaking = true
        this.frames = [...this.preRoll]
        this.speechMs = ms
        this.silenceMs = 0
      }
      return
    }

    this.frames.push(frame)
    if (loud) {
      this.speechMs += ms
      this.silenceMs = 0
    } else this.silenceMs += ms

    const total = this.frames.length * ms
    if (this.silenceMs >= END_SILENCE_MS || total >= MAX_UTTERANCE_MS) {
      const frames = this.frames
      const enough = this.speechMs >= MIN_SPEECH_MS
      this.reset()
      if (enough) void this.finish(frames)
    }
  }

  private async finish(frames: Float32Array[]): Promise<void> {
    const rate = this.ctx?.sampleRate ?? 48_000
    const audio = await resample(concat(frames), rate)
    const waiter = this.waiters.shift()
    if (waiter) waiter(audio)
    else this.onUtterance?.(audio)
  }
}

function concat(frames: Float32Array[]): Float32Array<ArrayBuffer> {
  const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0))
  let o = 0
  for (const f of frames) {
    out.set(f, o)
    o += f.length
  }
  return out
}

/** High-quality resample to 16 kHz using the browser's audio engine. */
async function resample(samples: Float32Array<ArrayBuffer>, fromRate: number): Promise<Float32Array> {
  if (fromRate === TARGET_RATE) return samples
  const length = Math.ceil((samples.length * TARGET_RATE) / fromRate)
  const offline = new OfflineAudioContext(1, length, TARGET_RATE)
  const buffer = offline.createBuffer(1, samples.length, fromRate)
  buffer.copyToChannel(samples, 0)
  const src = offline.createBufferSource()
  src.buffer = buffer
  src.connect(offline.destination)
  src.start()
  return (await offline.startRendering()).getChannelData(0)
}
