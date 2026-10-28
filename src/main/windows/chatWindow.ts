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
    // Keep timers and the microphone running while hidden (hands-free voice).
    webPreferences: { ...secureWebPreferences(), backgroundThrottling: false }
  })
  win.once('ready-to-show', () => win.show())
  // Throttling is off (voice keeps running hidden), so tell the page itself to stop animating.
  const visibility = (hidden: boolean) => () => win.webContents.send('window:visibility', { hidden })
  win.on('hide', visibility(true))
  win.on('minimize', visibility(true))
  win.on('show', visibility(false))
  win.on('restore', visibility(false))
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

/** Show without taking focus (e.g. a permission dialog while you work elsewhere). */
export function showChatInactive(): BrowserWindow {
  const win = getChatWindow() ?? createChatWindow()
  if (!win.isVisible() && !win.webContents.isLoading()) win.showInactive()
  return win
}

/** Make sure the chat window exists (it runs hands-free voice even while hidden). */
export function ensureChatWindow(): BrowserWindow {
  return getChatWindow() ?? createChatWindow()
}

export function toggleChat(): void {
  const win = getChatWindow()
  if (win && win.isVisible() && win.isFocused()) win.hide()
  else showChat()
}
