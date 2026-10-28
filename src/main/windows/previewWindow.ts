/**
 * previewWindow.ts — a little browser that shows the app being built.
 *
 * The window has two layers: pai's own toolbar (back, reload, address…) on top,
 * and the site itself below it in a separate WebContentsView. The site:
 *   - runs in its own session ("preview"), sandboxed, with no preload and no
 *     access to pai; every permission request (camera, mic…) is refused;
 *   - may only show local addresses (localhost, 127.0.0.1, ::1). Other https
 *     links open in your normal browser instead.
 * Console errors and failed loads are kept, so the assistant can check its work.
 */
import { BrowserWindow, WebContentsView, screen, session, shell } from 'electron'
import type { PreviewAction, PreviewState } from '@shared/ipc'
import { getChatWindow } from './chatWindow'
import { loadRenderer, secureWebPreferences } from './common'

const TOOLBAR_HEIGHT = 44
const MAX_LOG = 100
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0']

let win: BrowserWindow | null = null
let view: WebContentsView | null = null
/** Console messages and load failures since the last page load. */
let log: { level: string; text: string }[] = []

/** A local http(s) address, with 0.0.0.0 (which browsers refuse) turned into localhost. */
export function localUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(/^\w+:\/\//.test(raw.trim()) ? raw.trim() : `http://${raw.trim()}`)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!LOCAL_HOSTS.includes(url.hostname) && !url.hostname.endsWith('.localhost')) return null
  if (url.hostname === '0.0.0.0') url.hostname = 'localhost'
  return url.toString()
}

export function getPreviewWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

function previewSession(): Electron.Session {
  const s = session.fromPartition('preview')
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  s.setPermissionCheckHandler(() => false)
  return s
}

function state(): PreviewState {
  const wc = view?.webContents
  return {
    url: wc?.getURL() ?? '',
    title: wc?.getTitle() ?? '',
    loading: wc?.isLoading() ?? false,
    canGoBack: wc?.navigationHistory.canGoBack() ?? false,
    canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    errors: log.filter((l) => l.level === 'error').length
  }
}

function pushState(): void {
  getPreviewWindow()?.webContents.send('preview:state', state())
}

function layout(): void {
  if (!win || !view) return
  const { width, height } = win.getContentBounds()
  view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) })
}

/** Next to the chat window when there is room, otherwise centered. */
function placement(): { x?: number; y?: number; width: number; height: number } {
  const size = { width: 960, height: 720 }
  const chat = getChatWindow()
  if (!chat || !chat.isVisible()) return size
  const b = chat.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  if (b.x + b.width + size.width <= area.x + area.width) return { ...size, x: b.x + b.width + 8, y: b.y }
  return size
}

function createPreviewWindow(): BrowserWindow {
  const w = new BrowserWindow({
    ...placement(),
    minWidth: 360,
    minHeight: 300,
    title: 'Preview',
    backgroundColor: '#05060f',
    show: false,
    webPreferences: secureWebPreferences()
  })
  const v = new WebContentsView({
    webPreferences: { session: previewSession(), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  })
  v.setBackgroundColor('#ffffff')
  w.contentView.addChildView(v)
  const wc = v.webContents

  // Local pages only; https links elsewhere go to the normal browser.
  const guard = (event: Electron.Event, url: string) => {
    if (localUrl(url)) return
    event.preventDefault()
    if (url.startsWith('https://')) void shell.openExternal(url)
  }
  wc.on('will-navigate', guard)
  wc.on('will-redirect', guard)
  wc.setWindowOpenHandler(({ url }) => {
    const local = localUrl(url)
    if (local) void wc.loadURL(local)
    else if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const add = (level: string, text: string) => {
    log.push({ level, text: text.slice(0, 2000) })
    if (log.length > MAX_LOG) log = log.slice(-MAX_LOG)
  }
  wc.on('console-message', (e) => {
    if (e.message.includes('Electron Security Warning')) return // about the preview itself, not the site
    if (e.level === 'error' || e.level === 'warning') add(e.level, e.message)
    if (e.level === 'error') pushState()
  })
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) log = []
  })
  wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) add('error', `Could not load ${url}: ${description} (${code})`) // -3 = aborted by a new navigation
    pushState()
  })
  wc.on('render-process-gone', (_e, details) => add('error', `The page crashed (${details.reason}).`))
  for (const event of ['did-start-loading', 'did-stop-loading', 'page-title-updated', 'did-navigate', 'did-navigate-in-page'] as const) {
    wc.on(event as 'did-start-loading', pushState)
  }

  w.on('resize', layout)
  w.once('ready-to-show', () => {
    layout()
    w.show()
  })
  w.on('closed', () => {
    if (!wc.isDestroyed()) wc.close()
    win = null
    view = null
    log = []
  })
  loadRenderer(w, 'preview')
  win = w
  view = v
  layout()
  return w
}

/** Show a local address in the preview (opens the window if needed). Resolves when it has loaded (or failed). */
export async function openPreview(raw: string): Promise<PreviewState> {
  const url = localUrl(raw)
  if (!url) throw new Error('The preview only opens local addresses, like http://localhost:3000.')
  const w = getPreviewWindow() ?? createPreviewWindow()
  if (w.isMinimized()) w.restore()
  if (!w.webContents.isLoading()) w.showInactive() // ready-to-show shows a new window
  try {
    await view!.webContents.loadURL(url)
  } catch {
    // Recorded by did-fail-load.
  }
  pushState()
  return state()
}

const PAGE_TEXT_LIMIT = 4000

/** What the preview shows right now: address, title, visible text and recent errors (for the assistant). */
export async function inspectPreview(settleMs = 1500): Promise<{ state: PreviewState; text: string; problems: string[] }> {
  const wc = view?.webContents
  if (!wc || wc.isDestroyed()) throw new Error('The preview is not open.')
  // Give client-side code (React, hot reload…) a moment to render and report errors.
  await new Promise((r) => setTimeout(r, settleMs))
  let text = ''
  try {
    text = String(await wc.executeJavaScript('document.body ? document.body.innerText : ""', false)).slice(0, PAGE_TEXT_LIMIT)
  } catch {
    text = '(could not read the page)'
  }
  return { state: state(), text, problems: log.slice(-20).map((l) => `[${l.level}] ${l.text}`) }
}

/** The toolbar's buttons. */
export async function previewNav(action: PreviewAction, raw?: string): Promise<PreviewState> {
  const wc = view?.webContents
  if (!wc || wc.isDestroyed()) return state()
  if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
  else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  else if (action === 'reload') wc.reloadIgnoringCache()
  else if (action === 'devtools') wc.openDevTools({ mode: 'detach' })
  else if (action === 'external' && localUrl(wc.getURL())) await shell.openExternal(wc.getURL())
  else if (action === 'go' && typeof raw === 'string') {
    const url = localUrl(raw)
    if (!url) throw new Error('Only local addresses (localhost) can be opened here.')
    await wc.loadURL(url).catch(() => undefined)
  }
  return state()
}
