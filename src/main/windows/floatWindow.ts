/**
 * floatWindow.ts — the small always-on-top orb.
 *
 * Click: open/close chat. Drag: move it. Right-click: menu.
 * When a proactive offer arrives the window grows to show the offer card,
 * keeping its bottom-right corner (where the orb sits) in place.
 */
import { BrowserWindow, Menu, screen } from 'electron'
import { loadRenderer, secureWebPreferences } from './common'

const COMPACT = { width: 84, height: 84 }
const EXPANDED = { width: 360, height: 200 }

let floatWin: BrowserWindow | null = null

export interface FloatMenuActions {
  isEnabled(): boolean
  isQuiet(): boolean
  toggleChat(): void
  setEnabled(on: boolean): void
  setQuiet(on: boolean): void
  quit(): void
}

export function getFloatWindow(): BrowserWindow | null {
  return floatWin && !floatWin.isDestroyed() ? floatWin : null
}

export function createFloatWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    ...COMPACT,
    x: area.x + area.width - COMPACT.width - 24,
    y: area.y + area.height - COMPACT.height - 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: secureWebPreferences()
  })
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.once('ready-to-show', () => win.showInactive()) // don't steal focus
  loadRenderer(win, 'float')
  floatWin = win
  return win
}

/** Move by a delta, kept inside the visible screen area. */
export function dragFloat(dx: number, dy: number): void {
  const win = getFloatWindow()
  if (!win || !Number.isFinite(dx) || !Number.isFinite(dy)) return
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  const x = Math.min(Math.max(b.x + Math.round(dx), area.x), area.x + area.width - b.width)
  const y = Math.min(Math.max(b.y + Math.round(dy), area.y), area.y + area.height - b.height)
  win.setPosition(x, y)
}

/** Grow (offer visible) or shrink, anchored at the bottom-right corner. */
export function setFloatExpanded(expanded: boolean): void {
  const win = getFloatWindow()
  if (!win) return
  const size = expanded ? EXPANDED : COMPACT
  const b = win.getBounds()
  const right = b.x + b.width
  const bottom = b.y + b.height
  win.setBounds({ x: right - size.width, y: bottom - size.height, ...size })
}

export function showFloatMenu(actions: FloatMenuActions): void {
  const win = getFloatWindow()
  if (!win) return
  const enabled = actions.isEnabled()
  Menu.buildFromTemplate([
    { label: 'Open / close chat', click: actions.toggleChat },
    { type: 'separator' },
    { label: enabled ? 'Turn assistant OFF' : 'Turn assistant ON', click: () => actions.setEnabled(!enabled) },
    { label: 'Quiet mode', type: 'checkbox', checked: actions.isQuiet(), click: (item) => actions.setQuiet(item.checked) },
    { type: 'separator' },
    { label: 'Quit pai', click: actions.quit }
  ]).popup({ window: win })
}
