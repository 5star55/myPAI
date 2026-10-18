/**
 * downloads.ts — watches the Downloads folder for new files.
 * Only runs if Downloads is one of the approved folders.
 */
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { app } from 'electron'

const SETTLE_MS = 3000
const PARTIAL = ['.crdownload', '.part', '.download', '.tmp']

let watcher: FSWatcher | null = null
const timers = new Map<string, NodeJS.Timeout>()

export const downloadsDir = (): string => app.getPath('downloads')

export function startDownloadsWatcher(onNewFile: (path: string) => void): void {
  stopDownloadsWatcher()
  const dir = downloadsDir()
  if (!existsSync(dir)) return
  try {
    watcher = watch(dir, (_event, name) => {
      if (!name || name.startsWith('.') || PARTIAL.includes(extname(name).toLowerCase())) return
      // Wait until the file stops changing (downloads arrive in pieces).
      clearTimeout(timers.get(name))
      timers.set(
        name,
        setTimeout(async () => {
          timers.delete(name)
          const path = join(dir, name)
          const s = await stat(path).catch(() => null)
          if (s?.isFile() && Date.now() - s.birthtimeMs < 5 * 60_000) onNewFile(path)
        }, SETTLE_MS)
      )
    })
    watcher.on('error', () => stopDownloadsWatcher())
    console.log('[proactive] watching', dir)
  } catch (err) {
    console.warn('[proactive] cannot watch Downloads:', err)
  }
}

export function stopDownloadsWatcher(): void {
  watcher?.close()
  watcher = null
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
}

/** Number of loose (top-level) files, used by the "messy Downloads" rule. */
export async function countLooseFiles(): Promise<number> {
  const entries = await readdir(downloadsDir(), { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isFile() && !e.name.startsWith('.')).length
}
