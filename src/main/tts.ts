/**
 * tts.ts — natural-sounding speech, generated LOCALLY with Kokoro
 * (an open-source 82M-parameter voice model, Apache-2.0).
 *
 * The model (~90 MB) is downloaded from Hugging Face on first use and cached
 * in pai's data folder. After that it works offline. Text never leaves the
 * computer. The renderer plays the returned audio.
 */
import { join } from 'node:path'
import { NATURAL_VOICES, type Result } from '@shared/ipc'
import { dataDir } from './paths'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const MAX_CHARS = 1000

interface Kokoro {
  generate(text: string, opts: { voice: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number }>
}

let loading: Promise<Kokoro> | null = null

function getKokoro(): Promise<Kokoro> {
  if (!loading) {
    loading = (async () => {
      const t = await import('@huggingface/transformers')
      t.env.cacheDir = join(dataDir(), 'models')
      const { KokoroTTS } = await import('kokoro-js')
      console.log('[tts] loading', MODEL, '(first time downloads ~90 MB)')
      const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'cpu' })
      console.log('[tts] ready')
      return tts as unknown as Kokoro
    })().catch((err) => {
      loading = null // allow a retry later
      throw err
    })
  }
  return loading
}

export function warmUpTts(): void {
  void getKokoro().catch((err) => console.warn('[tts] warm-up failed:', err instanceof Error ? err.message : err))
}

/** One synthesis at a time keeps memory use low and order predictable. */
let queue: Promise<unknown> = Promise.resolve()

export function synthesize(text: unknown, voice: unknown, rate: unknown): Promise<Result<{ audio: Float32Array; sampleRate: number }>> {
  const run = queue.then(() => synthesizeNow(text, voice, rate))
  queue = run.catch(() => {})
  return run
}

async function synthesizeNow(text: unknown, voice: unknown, rate: unknown): Promise<Result<{ audio: Float32Array; sampleRate: number }>> {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Nothing to say.' }
  if (!NATURAL_VOICES.some((v) => v.id === voice)) return { ok: false, error: 'Unknown voice.' }
  const speed = typeof rate === 'number' && Number.isFinite(rate) ? Math.min(1.3, Math.max(0.8, rate)) : 1

  let tts: Kokoro
  try {
    tts = await getKokoro()
  } catch (err) {
    console.error('[tts] model load failed:', err)
    return { ok: false, error: "Couldn't load the natural voice. The first use needs internet to download it (~90 MB)." }
  }
  try {
    const out = await tts.generate(text.slice(0, MAX_CHARS), { voice: voice as string, speed })
    return { ok: true, value: { audio: out.audio, sampleRate: out.sampling_rate } }
  } catch (err) {
    console.error('[tts] synthesis failed:', err)
    return { ok: false, error: 'Speech generation failed.' }
  }
}
