import { BrowserWindow, screen } from 'electron'
import { loadRenderer, secureWebPreferences } from './common'

/** Opens the quick launcher from anywhere. Clashes are handled in index.ts, like the other shortcuts. */
export const LAUNCHER_HOTKEY = 'Control+Alt+L'

const WIDTH = 640
const HEIGHT = 84

let win: BrowserWindow | null = null

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
    alwaysOnTop: true,
    show: false,
    webPreferences: secureWebPreferences()
  })
  w.setAlwaysOnTop(true, 'screen-saver')
  // Clicking anywhere else closes it. Sending the question to chat also moves focus there, so it closes too.
  w.on('blur', () => w.hide())
  loadRenderer(w, 'launcher')
  win = w
  return w
}

/** Show the launcher centred near the top of the screen, or hide it if it's already open. */
export function toggleLauncher(): void {
  const w = win && !win.isDestroyed() ? win : create()
  if (w.isVisible()) {
    w.hide()
    return
  }
  const area = screen.getPrimaryDisplay().workArea
  w.setBounds({
    x: Math.round(area.x + (area.width - WIDTH) / 2),
    y: Math.round(area.y + area.height * 0.25),
    width: WIDTH,
    height: HEIGHT
  })
  const open = (): void => {
    w.show()
    w.focus()
    w.webContents.send('launcher:focus')
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', open)
  else open()
}

export function hideLauncher(): void {
  win?.hide()
}