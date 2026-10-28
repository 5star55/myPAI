/**
 * ipc.ts — the list of things the renderer is allowed to ask main to do.
 *
 * - Every handler returns a Result and never throws across the bridge.
 * - Every request is checked to come from one of OUR windows, and some only
 *   from a specific one (e.g. only the chat window can answer permissions).
 * - Every argument is treated as untrusted and validated.
 */
import { existsSync, statSync } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences, type IpcMainInvokeEvent } from 'electron'
import { IPC, MAX_REVIEW_CHARS, type AppState, type Result, type VoiceStatus } from '@shared/ipc'
import { cancelRun, runChat } from './agent/loop'
import { getPublicConfig } from './config'
import { refreshProactive, respondOffer } from './proactive/engine'
import { denyAllPending, respondPermission } from './security/permissions'
import { deleteUserSkill, getSkill, installImport, listSkills, loadSkills, previewImport, saveUserSkill, showUserSkillsFolder } from './skills/loader'
import { transcribe, warmUpSpeech } from './speech'
import { synthesize, warmUpTts } from './tts'
import { getSuggestions, resetSuggestIndex } from './suggest'
import { clearActivity, listActivity } from './store/activity'
import { listAlways, removeAlways } from './store/approvals'
import { addMemory, deleteMemory, listMemory, updateMemory } from './store/memory'
import { deleteConversation, getConversation, listConversations, renameConversation, saveConversation } from './store/conversations'
import { profileStore, sanitizeProfile } from './store/profile'
import { deleteReminder, listReminders } from './store/reminders'
import { stateStore } from './store/state'
import { notify, scheduleNextReminder, snoozeReminder } from './reminders/scheduler'
import { ensureChatWindow, getChatWindow, showChat, toggleChat } from './windows/chatWindow'
import { broadcast } from './windows/common'
import { getComposeWindow } from './windows/composeWindow'
import { refreshTray } from './windows/tray'
import { platform } from './platform'
import { chooseCompletion, checkComposeHotkey, composeAccess, composeAction, cancelCompose, syncComposeHotkey } from './compose'
import { dragFloat, focusFloat, getFloatWindow, setFloatExpanded, showFloatMenu } from './windows/floatWindow'
import { clearFinishedTasks, deleteTask, listTasks, replyToTask, resumeTasks, retryTask, startTask, stopAllTasks, stopTask } from './tasks/manager'
import { getPreviewWindow, openPreview, previewNav } from './windows/previewWindow'
import { stopAllServers } from './tools/servers'
import type { FloatSize, PreviewAction } from '@shared/ipc'

type From = 'chat' | 'float' | 'compose' | 'preview' | 'any'

function senderAllowed(event: IpcMainInvokeEvent, from: From): boolean {
  const win = BrowserWindow.fromWebContents(event.sender)
  const chat = getChatWindow()
  const float = getFloatWindow()
  if (from === 'chat') return !!win && win === chat
  if (from === 'float') return !!win && win === float
  if (from === 'compose') return !!win && win === getComposeWindow()
  if (from === 'preview') return !!win && win === getPreviewWindow()
  return !!win && (win === chat || win === float)
}

/** Register a handler with sender checks; exceptions become { ok: false }. */
function handle<T>(channel: string, from: From, fn: (...args: unknown[]) => Promise<Result<T>> | Result<T>): void {
  ipcMain.handle(channel, async (event, ...args): Promise<Result<T>> => {
    if (!senderAllowed(event, from)) return { ok: false, error: 'Not allowed from this window.' }
    try {
      return await fn(...args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ipc] ${channel} failed:`, err)
      return { ok: false, error: msg || 'Something went wrong inside pai.' }
    }
  })
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value })

/** The off switch and quiet mode. Exported for the float menu. */
export function setEnabled(enabled: boolean): AppState {
  const state = stateStore.update((s) => ({ ...s, enabled }))
  if (!enabled) {
    cancelRun() // abort the chat reply in progress
    stopAllTasks() // and every Ecospace task
    cancelCompose() // and the "Complete my text" popup
    denyAllPending() // close open permission dialogs as "deny"
    stopAllServers() // and the dev servers it started
  } else resumeTasks()
  refreshProactive()
  refreshTray()
  broadcast('state:changed', state)
  return state
}

export function setQuiet(quietMode: boolean): AppState {
  const state = stateStore.update((s) => ({ ...s, quietMode }))
  refreshProactive()
  refreshTray()
  broadcast('state:changed', state)
  return state
}

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory()

/** Show the main window on the Ecospace. */
export function openEcospace(): void {
  const win = showChat()
  const send = (): void => win.webContents.send('ui:navigate', { tab: 'ecospace' })
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/** Show the main window on the chat and send this message there. */
export function askInChat(text: string): void {
  const win = showChat()
  const send = (): void => {
    win.webContents.send('ui:navigate', { tab: 'chat' })
    win.webContents.send('chat:prefill', { text })
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/** Show the main window on a Settings section (e.g. "writing"). */
export function openSettings(section: string): void {
  const win = showChat()
  const send = (): void => win.webContents.send('ui:navigate', { tab: 'settings', section })
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

/** Hotkey / menu: start or stop a hands-free conversation. Runs in the chat window, even hidden. */
export function toggleVoice(): void {
  if (!stateStore.get().enabled) return
  const win = ensureChatWindow()
  const send = (): void => win.webContents.send('voice:toggle', {})
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}

export function registerIpc(menu: Parameters<typeof showFloatMenu>[0]): void {
  handle(IPC.getConfig, 'any', () => ok(getPublicConfig()))

  // Chat
  handle(IPC.chatSend, 'chat', (history) => runChat(history))
  handle(IPC.chatCancel, 'chat', () => ok(cancelRun()))
  handle(IPC.permissionRespond, 'chat', (res) => ok(respondPermission(res)))

  // State
  handle(IPC.stateGet, 'any', () => ok(stateStore.get()))
  handle(IPC.stateSetEnabled, 'any', (on) => ok(setEnabled(on === true)))
  handle(IPC.stateSetQuiet, 'any', (on) => ok(setQuiet(on === true)))

  // Profile
  handle(IPC.profileGet, 'any', () => ok(profileStore.get()))
  handle(IPC.profileSave, 'chat', (raw) => {
    const profile = sanitizeProfile(raw)
    profile.approvedFolders = profile.approvedFolders.filter(isDir)
    // A new Complete my text shortcut must be usable before anything is saved, so a clash changes nothing.
    const before = profileStore.get().compose
    const hotkeyChanging = profile.compose.hotkey !== before.hotkey || !before.enabled
    if (profile.compose.enabled && hotkeyChanging && platform.supports.completeText) {
      const problem = checkComposeHotkey(profile.compose.hotkey)
      if (problem) return { ok: false, error: problem }
    }
    profileStore.set(profile)
    syncComposeHotkey() // "Complete my text" may have been switched on or off, or its shortcut changed
    resetSuggestIndex() // folders may have changed
    refreshProactive()
    broadcast('data:changed', { what: 'profile' })
    return ok(profile)
  })
  handle(IPC.pickFolder, 'chat', async () => {
    const win = getChatWindow()
    const opts = { title: 'Approve a folder for pai', properties: ['openDirectory' as const, 'createDirectory' as const] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return ok(res.canceled ? null : (res.filePaths[0] ?? null))
  })
  handle(IPC.approvalsList, 'chat', () => ok(listAlways()))
  handle(IPC.approvalsRemove, 'chat', (key) => {
    if (typeof key === 'string') removeAlways(key)
    return ok(listAlways())
  })

  // Activity log
  handle(IPC.activityList, 'chat', () => ok(listActivity()))
  handle(IPC.activityClear, 'chat', () => ok(clearActivity()))

  // Memory
  handle(IPC.memoryList, 'chat', () => ok(listMemory()))
  handle(IPC.memoryAdd, 'chat', (text) => ok(addMemory(text)))
  handle(IPC.memoryUpdate, 'chat', (id, text) => ok(updateMemory(id, text)))
  handle(IPC.memoryDelete, 'chat', (id) => ok(deleteMemory(id)))

  // Saved conversations
  handle(IPC.convList, 'chat', (q) => ok(listConversations(q)))
  handle(IPC.convGet, 'chat', (id) => ok(getConversation(id)))
  handle(IPC.convSave, 'chat', (id, messages) => ok(saveConversation(id, messages)))
  handle(IPC.convRename, 'chat', (id, title) => ok(renameConversation(id, title)))
  handle(IPC.convDelete, 'chat', (id) => ok(deleteConversation(id)))

  // Reminders
  handle(IPC.remindersList, 'chat', () => ok(listReminders()))
  handle(IPC.remindersDelete, 'chat', (id) => {
    deleteReminder(id)
    scheduleNextReminder()
    return ok(undefined)
  })
  handle(IPC.reminderSnooze, 'any', (message) => ok(snoozeReminder(message)))
  handle(IPC.testNotification, 'chat', () => ok(notify(`${profileStore.get().assistantName} test`, 'If you can see this, reminders will reach you as notifications too.')))

  // Skills
  handle(IPC.skillsList, 'chat', () => ok(listSkills(profileStore.get())))
  handle(IPC.skillsReload, 'chat', () => {
    loadSkills()
    return ok(listSkills(profileStore.get()))
  })
  handle(IPC.skillsPick, 'chat', async () => {
    const win = getChatWindow()
    const opts = {
      title: 'Upload skills',
      buttonLabel: 'Review',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Skills', extensions: ['md', 'json'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return ok(res.canceled ? [] : previewImport(res.filePaths))
  })
  handle(IPC.skillsPreview, 'chat', (paths) => ok(previewImport(paths)))
  handle(IPC.skillsInstall, 'chat', (tokens) => {
    const ids = installImport(tokens)
    broadcast('data:changed', { what: 'skills' })
    return ok(ids)
  })
  handle(IPC.skillsGet, 'chat', (id) => ok(getSkill(id)))
  handle(IPC.skillsSave, 'chat', (draft) => {
    const s = saveUserSkill(draft)
    broadcast('data:changed', { what: 'skills' })
    return ok(s)
  })
  handle(IPC.skillsDelete, 'chat', async (id) => {
    await deleteUserSkill(id)
    // Forget it in the profile too.
    profileStore.update((p) => ({ ...p, enabledSkills: p.enabledSkills.filter((s) => s !== id) }))
    broadcast('data:changed', { what: 'skills' })
    return ok(undefined)
  })
  handle(IPC.skillsShowFolder, 'chat', async () => ok(await showUserSkillsFolder()))

  // Voice input (local Whisper)
  handle(IPC.micAccess, 'chat', async (prompt) => {
    // Automated tests run with Chromium's fake microphone; there is no real mic to ask about.
    if (process.platform !== 'darwin' || app.commandLine.hasSwitch('use-fake-device-for-media-stream')) return ok(true)
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return ok(true)
    if (prompt === false) return ok(false)
    return ok(await systemPreferences.askForMediaAccess('microphone'))
  })
  handle(IPC.speechWarmUp, 'chat', () => ok(warmUpSpeech()))
  handle(IPC.speechTranscribe, 'chat', async (audio) => {
    if (!stateStore.get().enabled) return { ok: false, error: 'The assistant is switched off.' }
    return transcribe(audio)
  })

  handle(IPC.voiceStatus, 'chat', (raw) => {
    const s = raw as VoiceStatus
    const states: VoiceStatus['state'][] = ['idle', 'listening', 'thinking', 'speaking', 'review']
    if (!states.includes(s?.state)) return { ok: false, error: 'Bad status.' }
    // The review caption is the whole message (it can be edited and sent), so it is not cut short.
    const max = s.state === 'review' ? MAX_REVIEW_CHARS : 200
    const status: VoiceStatus = { state: s.state, caption: typeof s.caption === 'string' ? s.caption.slice(0, max) : undefined }
    getFloatWindow()?.webContents.send('voice:status', status)
    return ok(undefined)
  })
  handle(IPC.voiceToggle, 'any', () => ok(toggleVoice()))
  handle(IPC.voiceReview, 'float', (action, text) => {
    if (action !== 'send' && action !== 'edit') return { ok: false, error: 'Bad action.' }
    if (text !== undefined && typeof text !== 'string') return { ok: false, error: 'Bad text.' }
    const win = action === 'edit' ? showChat() : ensureChatWindow() // Edit opens the chat with the text
    win.webContents.send('voice:review', { action, text: text?.slice(0, MAX_REVIEW_CHARS) })
    return ok(undefined)
  })
  handle(IPC.floatExpand, 'float', (size) => ok(setFloatExpanded((['orb', 'card', 'review', 'panel'] as FloatSize[]).includes(size as FloatSize) ? (size as FloatSize) : 'orb')))
  handle(IPC.floatFocus, 'float', () => ok(focusFloat()))

  // Ecospace tasks (from the main window or the orb)
  handle(IPC.taskStart, 'any', (prompt, source) => ok(startTask(prompt, source)))
  handle(IPC.taskList, 'any', () => ok(listTasks()))
  handle(IPC.taskStop, 'any', (id) => ok(stopTask(id)))
  handle(IPC.taskRetry, 'any', (id) => ok(retryTask(id)))
  handle(IPC.taskReply, 'any', (id, text) => ok(replyToTask(id, text)))
  handle(IPC.taskDelete, 'chat', (id) => ok(deleteTask(id)))
  handle(IPC.taskClearFinished, 'chat', () => ok(clearFinishedTasks()))
  handle(IPC.openEcospace, 'any', () => ok(openEcospace()))
  handle(IPC.askInChat, 'any', (text) => {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Nothing to ask.' }
    return ok(askInChat(text.trim().slice(0, 4000)))
  })
  // Natural voice (local Kokoro) and the OS voice settings page.
  handle(IPC.ttsSynthesize, 'chat', (text, voice, rate) => synthesize(text, voice, rate))
  handle(IPC.ttsWarmUp, 'chat', () => ok(warmUpTts()))
  handle(IPC.openVoiceSettings, 'chat', async () => {
    // Fixed, known URLs only: this never opens anything the renderer asks for.
    const url =
      process.platform === 'darwin'
        ? 'x-apple.systempreferences:com.apple.Accessibility-Settings.extension?SpokenContent'
        : process.platform === 'win32'
          ? 'ms-settings:speech'
          : null
    if (!url) return { ok: false, error: 'Open your system speech settings to add voices.' }
    await shell.openExternal(url)
    return ok(undefined)
  })
  handle(IPC.suggest, 'any', async (text) => ok(stateStore.get().enabled ? await getSuggestions(text) : []))

  // Offers + windows
  handle(IPC.offerRespond, 'float', (id, choice) => ok(respondOffer(id, choice)))
  handle(IPC.toggleChat, 'any', () => ok(toggleChat()))
  handle(IPC.floatDrag, 'float', (dx, dy) => ok(dragFloat(Number(dx), Number(dy))))
  handle(IPC.floatMenu, 'float', () => ok(showFloatMenu(menu)))

  // Preview browser: the chat opens local pages in it; its toolbar navigates.
  handle(IPC.previewOpen, 'chat', async (url) => {
    if (typeof url !== 'string') return { ok: false, error: 'Bad address.' }
    await openPreview(url)
    return ok(undefined)
  })
  handle(IPC.previewNav, 'preview', async (action, url) => {
    const actions: PreviewAction[] = ['state', 'back', 'forward', 'reload', 'go', 'devtools', 'external']
    if (!actions.includes(action as PreviewAction)) return { ok: false, error: 'Bad action.' }
    return ok(await previewNav(action as PreviewAction, typeof url === 'string' ? url.slice(0, 2000) : undefined))
  })

  // "Complete my text" popup (other apps)
  handle(IPC.composeChoose, 'compose', async (i) => ok(await chooseCompletion(i)))
  handle(IPC.composeCancel, 'compose', () => ok(cancelCompose()))
  handle(IPC.composeAction, 'compose', async () => ok(await composeAction()))
  handle(IPC.composeAccess, 'chat', async (prompt) => ok(await composeAccess(prompt === true)))
}
