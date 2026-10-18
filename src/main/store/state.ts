/**
 * state.ts — the off switch and quiet mode.
 * Persisted, so if you turn pai off it stays off after a restart.
 */
import type { AppState } from '@shared/ipc'
import { dataFile } from '../paths'
import { JsonStore, isObj } from './jsonStore'

const fallback = (): AppState => ({ enabled: true, quietMode: false })

export const stateStore = new JsonStore<AppState>(() => dataFile('state.json'), fallback, (raw) => {
  if (!isObj(raw)) return fallback()
  return { enabled: raw.enabled !== false, quietMode: raw.quietMode === true }
})

export const isEnabled = (): boolean => stateStore.get().enabled
