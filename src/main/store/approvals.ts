/**
 * approvals.ts — "always allow" decisions the user ticked in the permission dialog.
 * Keys look like "list_files|/Users/me/Downloads". Revocable in Settings.
 */
import { dataFile } from '../paths'
import { JsonStore } from './jsonStore'

const store = new JsonStore<string[]>(() => dataFile('approvals.json'), () => [], (raw) =>
  Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : []
)

export const listAlways = (): string[] => store.get()
export const hasAlways = (key: string): boolean => store.get().includes(key)
export const addAlways = (key: string): void => void store.update((keys) => [...new Set([...keys, key])])
export const removeAlways = (key: string): void => void store.update((keys) => keys.filter((k) => k !== key))
export const clearAlways = (): void => void store.set([])
