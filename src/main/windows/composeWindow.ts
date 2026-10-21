/**
 * composeWindow.ts — the small "Complete my text" popup shown next to the caret
 * in another app. It takes the keyboard (1-3, arrows, Enter, Esc) without
 * activating pai, so the app you're typing in stays in front.
 */
import { BrowserWindow, screen } from 'electron'
import type { ComposeView } from '@shared/ipc'
import { loadRenderer, secureWebPreferences } from './common'

const WIDTH = 380
const HEIGHT = 216
const GAP = 8

export interface Anchor {
  x: number
  y: number
  /** Height of the caret line, so the popup sits just below it. */
  h: number
}

let win: BrowserWindow | null = null
let onBlur: (() => void) | null = null

export function getComposeWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

function create(): BrowserWindow {
  const w = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
     focusable: process.platform !== 'win32', // Windows: never take focus, so the app you're typing in stays active
    alwaysOnTop: true,
    // macOS: a non-activating panel; it can take the keyboard while the other app stays active.
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    show: false,
    webPreferences: secureWebPreferences()
  })
  w.setAlwaysOnTop(true, 'pop-up-menu')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  w.on('blur', () => onBlur?.())
  loadRenderer(w, 'compose')
  win = w
  return w
}

/** Below the caret if it fits, otherwise above it; always on screen. */
function place(anchor: Anchor): { x: number; y: number } {
  const area = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) }).workArea
  let x = Math.round(anchor.x) - 14
  let y = Math.round(anchor.y + anchor.h + GAP)
  if (y + HEIGHT > area.y + area.height) y = Math.round(anchor.y - HEIGHT - GAP)
  x = Math.min(Math.max(x, area.x + 4), area.x + area.width - WIDTH - 4)
  y = Math.min(Math.max(y, area.y + 4), area.y + area.height - HEIGHT - 4)
  return { x, y }
}

/** Show (or update) the popup. `blur` is called if you click somewhere else. */
export function showCompose(view: ComposeView, anchor: Anchor | null, blur: () => void): void {
  onBlur = blur
  const w = getComposeWindow() ?? create()
  if (anchor) w.setPosition(place(anchor).x, place(anchor).y)
   const send = (): void => {
    w.webContents.send('compose:view', view)
    if (!w.isVisible()) {
      w.showInactive()
      if (process.platform !== 'win32') {
        // Mac and Linux keep the keyboard (1-3, Enter, Esc).
        w.setFocusable(true)
        w.focus()
      }
    }
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send)
  else send()
}

export function hideCompose(): void {
  onBlur = null
  const w = getComposeWindow()
  if (w?.isVisible()) w.hide()
}

/** Where the mouse is, as a fallback when the caret can't be found. */
export function mouseAnchor(): Anchor {
  const p = screen.getCursorScreenPoint()
  return { x: p.x, y: p.y, h: 16 }
}
