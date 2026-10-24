/**
 * Main process entry: loads config and skills, creates the windows,
 * wires up IPC, and starts the reminder scheduler and proactive engine.
 * All privileged work (files, shell, models) happens in the main process.
 */
import { app, globalShortcut, session } from 'electron'
import { VOICE_HOTKEY } from '@shared/ipc'
import { getConfig } from './config'
import { syncComposeHotkey } from './compose'
import { stopHelper } from './compose/helper'
import { openEcospace, openSettings, registerIpc, setEnabled, setQuiet, toggleVoice } from './ipc'
import { refreshProactive, setChatSender } from './proactive/engine'
import { startReminderScheduler } from './reminders/scheduler'
import { loadSkills } from './skills/loader'
import { stateStore } from './store/state'
import { getChatWindow, showChat, toggleChat } from './windows/chatWindow'
import { lifecycle } from './windows/common'
import { createFloatWindow, getFloatWindow } from './windows/floatWindow'
import { LAUNCHER_HOTKEY, toggleLauncher } from './windows/launcherWindow'
// Log unexpected errors instead of letting Electron show a crash dialog.
process.on('uncaughtException', (err) => console.error('[main] uncaught exception:', err))
process.on('unhandledRejection', (err) => console.error('[main] unhandled rejection:', err))

// Optional: keep data somewhere else (handy for testing with a throwaway profile).
if (process.env.PAI_DATA_DIR) app.setPath('userData', process.env.PAI_DATA_DIR)

// Only one copy of pai at a time; a second launch focuses the first.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => showChat())

app.whenReady().then(() => {
  const cfg = getConfig()
  console.log(`[main] pai starting. MODEL_MODE=${cfg.mode}, base URL=${cfg.baseURL}`)
  for (const w of cfg.warnings) console.warn(`[config] ${w}`)

  // Media permission: ONLY the chat window, ONLY the microphone (never the camera or screen).
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const fromChat = wc === getChatWindow()?.webContents
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
    callback(fromChat && permission === 'media' && types.length > 0 && types.every((t) => t === 'audio'))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && wc === getChatWindow()?.webContents)

  loadSkills()
  registerIpc({
    talk: toggleVoice,
    openEcospace,
    isEnabled: () => stateStore.get().enabled,
    isQuiet: () => stateStore.get().quietMode,
    toggleChat,
    setEnabled: (on) => void setEnabled(on),
    setQuiet: (on) => void setQuiet(on),
    quit: () => app.quit()
  })

  // Accepted proactive offers are sent as a chat message from the chat screen.
  setChatSender((text) => {
    const win = showChat()
    const send = (): void => win.webContents.send('chat:prefill', { text })
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
  })

  showChat()
  createFloatWindow()

    // Push-to-talk from anywhere. If another app owns the shortcut, say so (the orb menu still works).
  if (!globalShortcut.register(VOICE_HOTKEY, toggleVoice)) {
    console.warn(`[voice] could not register ${VOICE_HOTKEY}; another app may be using it`)
  }
  // Quick launcher: the search bar (A8).
  if (!globalShortcut.register(LAUNCHER_HOTKEY, toggleLauncher)) {
    console.warn(`[launcher] could not register ${LAUNCHER_HOTKEY}; another app may be using it`)
  }
  // "Complete my text" (⌃⌥Space in other apps), only while switched on in Settings.
  syncComposeHotkey(openSettings)
  startReminderScheduler()
  refreshProactive()

  // macOS: clicking the dock icon re-opens the chat.
  app.on('activate', () => showChat())
})

app.on('before-quit', () => {
  lifecycle.quitting = true
})
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopHelper()
})

// The floating icon keeps the app alive; quit from its right-click menu.
app.on('window-all-closed', () => {
  if (!getChatWindow() && !getFloatWindow()) app.quit()
})

