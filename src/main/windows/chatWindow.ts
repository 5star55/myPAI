/**
 * chatWindow.ts — the main window (chat, activity, memory, settings...).
 * Closing it only hides it, so the conversation is still there next time.
 */
import { BrowserWindow } from 'electron'
import { lifecycle, loadRenderer, secureWebPreferences } from './common'

let chatWin: BrowserWindow | null = null

export function getChatWindow(): BrowserWindow | null {
  return chatWin && !chatWin.isDestroyed() ? chatWin : null
}

function createChatWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 680,
    minHeight: 520,
    title: 'pai',
    backgroundColor: '#05060f', // matches the UI so there is no white flash
    show: false,
    webPreferences: secureWebPreferences()
  })
  win.once('ready-to-show', () => win.show())
  win.on('close', (event) => {
    if (!lifecycle.quitting) {
      event.preventDefault()
      win.hide()
    }
  })
  loadRenderer(win, 'main')
  chatWin = win
  return win
}

export function showChat(): BrowserWindow {
  const win = getChatWindow() ?? createChatWindow()
  if (win.isMinimized()) win.restore()
  if (!win.isVisible() && win.webContents.isLoading()) return win // ready-to-show will show it
  win.show()
  win.focus()
  return win
}

export function toggleChat(): void {
  const win = getChatWindow()
  if (win && win.isVisible() && win.isFocused()) win.hide()
  else showChat()
}
