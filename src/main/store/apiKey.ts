/**
 * apiKey.ts — the model API key the user pastes in Settings (or during setup).
 *
 * Stored in pai's user-data folder (never in the repo or the installer), encrypted
 * with the system keychain through Electron's safeStorage when it is available.
 * The key itself never goes back to the UI: only whether one is set, where it came
 * from, and its last 4 characters.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'
import { dataFile } from '../paths'

const FILE = 'api-key.bin'
const PLAIN_PREFIX = 'plain:' // only when the system offers no encryption

let cached: string | null | undefined

/** The saved key, or '' if none. */
export function savedApiKey(): string {
  if (cached !== undefined) return cached ?? ''
  cached = null
  const path = dataFile(FILE)
  if (!existsSync(path)) return ''
  try {
    const raw = readFileSync(path)
    const text = raw.subarray(0, PLAIN_PREFIX.length).toString() === PLAIN_PREFIX ? raw.subarray(PLAIN_PREFIX.length).toString('utf8') : safeStorage.decryptString(raw)
    cached = text.trim() || null
  } catch (err) {
    console.error('[apiKey] could not read the saved key:', err)
  }
  return cached ?? ''
}

/** Check the shape of a pasted key. Returns an error message, or null if it looks fine. */
export function checkKeyShape(key: string): string | null {
  if (!key) return 'Paste your API key first.'
  if (/\s/.test(key)) return 'The key has spaces or line breaks in it. Copy it again, without them.'
  if (key.length < 16 || key.length > 512) return "That doesn't look like a full API key. Copy the whole key again."
  return null
}

export function saveApiKey(key: string): void {
  const path = dataFile(FILE)
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(PLAIN_PREFIX + key, 'utf8')
  mkdirSync(dirname(path), { recursive: true }) // a brand-new install may not have its data folder yet
  writeFileSync(path, data, { mode: 0o600 })
  cached = key
}

export function removeApiKey(): void {
  rmSync(dataFile(FILE), { force: true })
  cached = null
}

/** "…a1b2" — enough to recognise a key, never enough to use it. */
export const maskKey = (key: string): string => (key.length > 8 ? `…${key.slice(-4)}` : '…')
