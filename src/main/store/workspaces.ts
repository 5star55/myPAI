/**
 * workspaces.ts — folders pai created itself (a scaffolded project, a folder it made).
 *
 * They are pai's own work, so creating, editing and replacing files inside them, and
 * normal commands there (npm install, builds), don't ask each time. Deletes and risky
 * commands still do, and replaced files still go to the Trash. The user's own folders
 * are never added here. Kept in the data folder, so a project stays trusted next time.
 */
import { dataFile } from '../paths'
import { isInside, realPath } from '../security/allowlist'
import { JsonStore } from './jsonStore'

const MAX = 200

const store = new JsonStore<string[]>(() => dataFile('workspaces.json'), () => [], (raw) =>
  Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string').slice(-MAX) : []
)

export const listWorkspaces = (): string[] => store.get()

/** Remember a folder pai just created. */
export function addWorkspace(folder: string): void {
  const real = realPath(folder)
  if (store.get().some((w) => isInside(real, w))) return // already covered
  store.update((list) => [...list.filter((w) => !isInside(w, real)), real].slice(-MAX))
}

export function removeWorkspace(folder: string): void {
  store.update((list) => list.filter((w) => w !== folder))
}

/** Is this path inside something pai created? */
export const inWorkspace = (path: string): boolean => store.get().some((w) => isInside(realPath(path), w))
