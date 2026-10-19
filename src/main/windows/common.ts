/**
 * common.ts — settings shared by every pai window.
 */
import { join } from 'node:path'
import { app, BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron'
import type { EventMap, EventName } from '@shared/ipc'

/** Secure defaults for every window: no Node in the page, sandbox on. */
export function secureWebPreferences(): BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false
  }
}

/** Load the React app. `view` selects the screen (e.g. "float"). */
export function loadRenderer(win: BrowserWindow, view: 'main' | 'float' | 'compose'): void {
  // Security: windows never navigate away; https links open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  // Show UI errors in the terminal so problems are easy to spot.
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error(`[ui:${view}] ${e.message}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => console.error(`[ui:${view}] crashed: ${details.reason}`))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#${view}`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: view })
}

/** Send a push event to every open window. */
export function broadcast<E extends EventName>(event: E, payload: EventMap[E]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(event, payload)
  }
}

/** Set to true in before-quit so windows know to really close instead of hiding. */
export const lifecycle = { quitting: false }
