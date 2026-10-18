/**
 * jsonStore.ts — a tiny, safe JSON file store.
 *
 * - Writes are atomic: write to a temp file, then rename. A crash mid-write
 *   can never leave a half-written (corrupt) file behind.
 * - Reads never throw: a missing or corrupt file falls back to the default
 *   (a corrupt file is kept as *.corrupt so nothing is silently lost).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export class JsonStore<T> {
  private cache: T | null = null

  /**
   * @param file      returns the absolute path of the JSON file. A function, so the
   *                  path is decided on first use (after PAI_DATA_DIR is applied),
   *                  not when this module is imported.
   * @param fallback  value used when the file does not exist yet
   * @param sanitize  repairs/validates data loaded from disk (never trust files)
   */
  constructor(
    private readonly file: () => string,
    private readonly fallback: () => T,
    private readonly sanitize: (raw: unknown) => T
  ) {}

  get(): T {
    if (this.cache) return this.cache
    this.cache = this.load()
    return this.cache
  }

  set(value: T): T {
    this.cache = value
    const file = this.file()
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    renameSync(tmp, file)
    return value
  }

  update(fn: (current: T) => T): T {
    return this.set(fn(this.get()))
  }

  private load(): T {
    const file = this.file()
    if (!existsSync(file)) return this.fallback()
    try {
      return this.sanitize(JSON.parse(readFileSync(file, 'utf8')))
    } catch (err) {
      console.error(`[store] ${file} is unreadable, starting fresh:`, err)
      try {
        renameSync(file, `${file}.corrupt`)
      } catch {
        /* ignore */
      }
      return this.fallback()
    }
  }
}

/** Small helpers for sanitizers. */
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
export const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
