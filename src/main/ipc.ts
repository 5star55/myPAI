/**
 * ipc.ts — the list of things the renderer is allowed to ask main to do.
 *
 * - Every handler returns a Result and never throws across the bridge.
 * - Every request is checked to come from one of OUR windows, and some only
 *   from a specific one (e.g. only the chat window can answer permissions).
 * - Every argument is treated as untrusted and validated.
 */
import { existsSync, statSync } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, systemPreferences, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppState, type Result } from '@shared/ipc'
import { cancelRun, runChat } from './agent/loop'
import { getPublicConfig } from './config'
import { refreshProactive, respondOffer } from './proactive/engine'
import { denyAllPending, respondPermission } from './security/permissions'
import { listSkills, loadSkills } from './skills/loader'
import { transcribe, warmUpSpeech } from './speech'
import { clearActivity, listActivity } from './store/activity'
import { listAlways, removeAlways } from './store/approvals'
import { addMemory, deleteMemory, listMemory, updateMemory } from './store/memory'
import { profileStore, sanitizeProfile } from './store/profile'
import { deleteReminder, listReminders } from './store/reminders'
import { stateStore } from './store/state'
import { getChatWindow, toggleChat } from './windows/chatWindow'
import { broadcast } from './windows/common'
import { dragFloat, getFloatWindow, showFloatMenu } from './windows/floatWindow'

type From = 'chat' | 'float' | 'any'

function senderAllowed(event: IpcMainInvokeEvent, from: From): boolean {
  const win = BrowserWindow.fromWebContents(event.sender)
  const chat = getChatWindow()
  const float = getFloatWindow()
  if (from === 'chat') return !!win && win === chat
  if (from === 'float') return !!win && win === float
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
    cancelRun() // abort the model request in progress
    denyAllPending() // close open permission dialogs as "deny"
  }
  refreshProactive()
  broadcast('state:changed', state)
  return state
}

export function setQuiet(quietMode: boolean): AppState {
  const state = stateStore.update((s) => ({ ...s, quietMode }))
  refreshProactive()
  broadcast('state:changed', state)
  return state
}

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory()

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
    profileStore.set(profile)
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

  // Reminders
  handle(IPC.remindersList, 'chat', () => ok(listReminders()))
  handle(IPC.remindersDelete, 'chat', (id) => ok(deleteReminder(id)))

  // Skills
  handle(IPC.skillsList, 'chat', () => ok(listSkills(profileStore.get())))
  handle(IPC.skillsReload, 'chat', () => {
    loadSkills()
    return ok(listSkills(profileStore.get()))
  })

  // Voice input (local Whisper)
  handle(IPC.micAccess, 'chat', async () => {
    if (process.platform !== 'darwin') return ok(true)
    if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return ok(true)
    return ok(await systemPreferences.askForMediaAccess('microphone'))
  })
  handle(IPC.speechWarmUp, 'chat', () => ok(warmUpSpeech()))
  handle(IPC.speechTranscribe, 'chat', async (audio) => {
    if (!stateStore.get().enabled) return { ok: false, error: 'The assistant is switched off.' }
    return transcribe(audio)
  })

  // Offers + windows
  handle(IPC.offerRespond, 'float', (id, choice) => ok(respondOffer(id, choice)))
  handle(IPC.toggleChat, 'any', () => ok(toggleChat()))
  handle(IPC.floatDrag, 'float', (dx, dy) => ok(dragFloat(Number(dx), Number(dy))))
  handle(IPC.floatMenu, 'float', () => ok(showFloatMenu(menu)))
}
