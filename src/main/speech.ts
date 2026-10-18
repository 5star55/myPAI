/**
 * speech.ts — voice input. Transcribes audio LOCALLY with Whisper
 * (Transformers.js + ONNX Runtime). The model (~80 MB) is downloaded from
 * Hugging Face on first use and cached in pai's data folder; after that,
 * audio never leaves this computer.
 *
 * Input: mono Float32 PCM at 16 kHz (the renderer records and resamples).
 */
import { join } from 'node:path'
import type { Result } from '@shared/ipc'
import { dataDir } from './paths'

const MODEL = 'onnx-community/whisper-base'
export const SAMPLE_RATE = 16_000
const MAX_SECONDS = 60

type Transcriber = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>

let loading: Promise<Transcriber> | null = null

/** Load the model once; later calls reuse it. */
function getTranscriber(): Promise<Transcriber> {
  if (!loading) {
    loading = (async () => {
      const t = await import('@huggingface/transformers')
      t.env.cacheDir = join(dataDir(), 'models')
      t.env.allowLocalModels = false
      console.log('[speech] loading', MODEL, '(first time downloads ~80 MB)')
      const pipe = await t.pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8', device: 'cpu' })
      console.log('[speech] ready')
      return pipe as unknown as Transcriber
    })().catch((err) => {
      loading = null // allow a retry later
      throw err
    })
  }
  return loading
}

/** Start loading in the background (e.g. when the mic button is first shown). */
export function warmUpSpeech(): void {
  void getTranscriber().catch((err) => console.warn('[speech] warm-up failed:', err instanceof Error ? err.message : err))
}

export async function transcribe(input: unknown): Promise<Result<string>> {
  if (!(input instanceof Float32Array)) return { ok: false, error: 'Invalid audio.' }
  if (input.length < SAMPLE_RATE * 0.3) return { ok: false, error: 'That was too short. Hold the mic button a bit longer.' }
  if (input.length > SAMPLE_RATE * MAX_SECONDS) return { ok: false, error: `Recordings can be at most ${MAX_SECONDS} seconds.` }

  let transcriber: Transcriber
  try {
    transcriber = await getTranscriber()
  } catch (err) {
    console.error('[speech] model load failed:', err)
    return { ok: false, error: "Couldn't load the speech model. The first use needs internet to download it (~80 MB)." }
  }
  try {
    const out = await transcriber(input, { language: 'english', task: 'transcribe', chunk_length_s: 30 })
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim()
    // Whisper says things like "[BLANK_AUDIO]" or "(silence)" for silence.
    const cleaned = text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim()
    if (!cleaned) return { ok: false, error: "I didn't catch anything. Try again a little closer to the mic." }
    return { ok: true, value: cleaned }
  } catch (err) {
    console.error('[speech] transcription failed:', err)
    return { ok: false, error: 'Transcription failed. Try again.' }
  }
}
