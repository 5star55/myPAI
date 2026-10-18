/**
 * Preload — the ONLY bridge between the React UI and the main process.
 * It exposes a small, typed API on window.pai. Nothing else leaks through:
 * the page can only listen to the event names in EVENT_NAMES.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { EVENT_NAMES, IPC, type PaiApi } from '@shared/ipc'

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: PaiApi = {
  getConfig: () => call(IPC.getConfig),
  sendChat: (history) => call(IPC.chatSend, history),
  cancelChat: () => call(IPC.chatCancel),
  respondPermission: (res) => call(IPC.permissionRespond, res),

  getState: () => call(IPC.stateGet),
  setEnabled: (on) => call(IPC.stateSetEnabled, on),
  setQuiet: (on) => call(IPC.stateSetQuiet, on),

  getProfile: () => call(IPC.profileGet),
  saveProfile: (p) => call(IPC.profileSave, p),
  pickFolder: () => call(IPC.pickFolder),
  listApprovals: () => call(IPC.approvalsList),
  removeApproval: (key) => call(IPC.approvalsRemove, key),

  listActivity: () => call(IPC.activityList),
  clearActivity: () => call(IPC.activityClear),

  listMemory: () => call(IPC.memoryList),
  addMemory: (text) => call(IPC.memoryAdd, text),
  updateMemory: (id, text) => call(IPC.memoryUpdate, id, text),
  deleteMemory: (id) => call(IPC.memoryDelete, id),

  listReminders: () => call(IPC.remindersList),
  deleteReminder: (id) => call(IPC.remindersDelete, id),

  listSkills: () => call(IPC.skillsList),
  reloadSkills: () => call(IPC.skillsReload),

  respondOffer: (id, choice) => call(IPC.offerRespond, id, choice),

  requestMic: () => call(IPC.micAccess),
  warmUpSpeech: () => call(IPC.speechWarmUp),
  transcribe: (audio) => call(IPC.speechTranscribe, audio),

  toggleChat: () => call(IPC.toggleChat),
  dragFloat: (dx, dy) => call(IPC.floatDrag, dx, dy),
  showFloatMenu: () => call(IPC.floatMenu),

  on(event, cb) {
    if (!EVENT_NAMES.includes(event)) throw new Error(`Unknown event: ${event}`)
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => cb(payload as Parameters<typeof cb>[0])
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  }
}

contextBridge.exposeInMainWorld('pai', api)
