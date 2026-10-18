/**
 * activeWindow.ts — which app is in front, polled every few seconds.
 *
 * PRIVACY: the app name and window title are kept in memory only
 * (this variable). They are never written to disk or the activity log.
 * get-windows is loaded lazily; if it can't load, the feature switches off.
 */
type ActiveWindowFn = (opts: { accessibilityPermission: boolean; screenRecordingPermission: boolean }) => Promise<
  { title: string; owner: { name: string } } | undefined
>

export interface ActiveApp {
  app: string
  title: string
  /** When this app came to the front. */
  since: number
}

let fn: ActiveWindowFn | null | undefined
let current: ActiveApp | null = null

async function load(): Promise<ActiveWindowFn | null> {
  if (fn !== undefined) return fn
  try {
    const mod = (await import('get-windows')) as { activeWindow: ActiveWindowFn }
    fn = mod.activeWindow
  } catch (err) {
    console.warn('[proactive] active window detection unavailable:', err instanceof Error ? err.message : err)
    fn = null
  }
  return fn
}

/** Poll once. Returns the current app (in memory only). */
export async function pollActiveWindow(): Promise<ActiveApp | null> {
  const get = await load()
  if (!get) return null
  try {
    // No permission prompts: on macOS the title stays empty unless already allowed.
    const w = await get({ accessibilityPermission: false, screenRecordingPermission: false })
    if (!w) return current
    if (!current || current.app !== w.owner.name) current = { app: w.owner.name, title: w.title, since: Date.now() }
    else current.title = w.title
  } catch {
    /* transient errors are fine */
  }
  return current
}

export function forgetActiveWindow(): void {
  current = null
}
