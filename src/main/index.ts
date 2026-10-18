/**
 * Main process entry. Creates windows and wires up IPC.
 * All privileged work (files, shell, models) happens in the main process.
 */
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { getConfig } from './config'
import { registerIpc } from './ipc'

// Log unexpected errors instead of letting Electron show a crash dialog.
process.on('uncaughtException', (err) => console.error('[main] uncaught exception:', err))
process.on('unhandledRejection', (err) => console.error('[main] unhandled rejection:', err))

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 640,
    minHeight: 480,
    title: 'pai',
    backgroundColor: '#05060f', // matches the UI so there is no white flash
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // renderer cannot touch Node or Electron internals
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  // Security: the app window never navigates away or opens new Electron windows.
  // External links open in the user's normal browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  // In dev, electron-vite serves the renderer with hot reload; otherwise load the built file.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  return win
}

app.whenReady().then(() => {
  const cfg = getConfig()
  console.log(`[main] pai starting. MODEL_MODE=${cfg.mode}, base URL=${cfg.baseURL}`)
  for (const w of cfg.warnings) console.warn(`[config] ${w}`)

  registerIpc()
  createMainWindow()

  // macOS: re-open a window when the dock icon is clicked.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
