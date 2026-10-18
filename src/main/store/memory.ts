/**
 * memory.ts — long-term facts about the user, in memory.json.
 * The assistant can save/recall; the user can view, edit and delete in the Memory screen.
 */
import type { MemoryItem } from '@shared/ipc'
import { dataFile } from '../paths'
import { JsonStore, isObj, newId, str } from './jsonStore'

export const MAX_MEMORY_CHARS = 500
const MAX_ITEMS = 300

const store = new JsonStore<MemoryItem[]>(
  () => dataFile('memory.json'),
  () => [],
  (raw) =>
    Array.isArray(raw)
      ? raw.filter(isObj).map((m) => ({
          id: str(m.id) || newId(),
          text: str(m.text).slice(0, MAX_MEMORY_CHARS),
          createdAt: str(m.createdAt, new Date().toISOString()),
          updatedAt: str(m.updatedAt, new Date().toISOString())
        }))
      : []
)

function cleanText(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Memory text cannot be empty.')
  return text.trim().slice(0, MAX_MEMORY_CHARS)
}

export const listMemory = (): MemoryItem[] => store.get()

export function addMemory(text: unknown): MemoryItem {
  const clean = cleanText(text)
  const existing = store.get().find((m) => m.text.toLowerCase() === clean.toLowerCase())
  if (existing) return existing // no duplicates
  if (store.get().length >= MAX_ITEMS) throw new Error(`Memory is full (${MAX_ITEMS} items). Delete some first.`)
  const now = new Date().toISOString()
  const item: MemoryItem = { id: newId(), text: clean, createdAt: now, updatedAt: now }
  store.update((items) => [...items, item])
  return item
}

export function updateMemory(id: unknown, text: unknown): MemoryItem {
  const clean = cleanText(text)
  const item = store.get().find((m) => m.id === id)
  if (!item) throw new Error('That memory no longer exists.')
  const updated = { ...item, text: clean, updatedAt: new Date().toISOString() }
  store.update((items) => items.map((m) => (m.id === id ? updated : m)))
  return updated
}

export function deleteMemory(id: unknown): void {
  store.update((items) => items.filter((m) => m.id !== id))
}

/** Simple keyword search, good enough for a few hundred facts. */
export function searchMemory(query: string): MemoryItem[] {
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
  if (words.length === 0) return store.get()
  return store.get().filter((m) => words.some((w) => m.text.toLowerCase().includes(w)))
}
