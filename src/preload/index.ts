/**
 * Preload — the ONLY bridge between the React UI and the main process.
 * It exposes a small, typed API on window.pai. Nothing else leaks through:
 * the page can only listen to the event names in EVENT_NAMES.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
  snoozeReminder: (message) => call(IPC.reminderSnooze, message),
  testNotification: () => call(IPC.testNotification),

  listSkills: () => call(IPC.skillsList),
  reloadSkills: () => call(IPC.skillsReload),
  pickSkillFiles: () => call(IPC.skillsPick),
  // Dropped files: only their paths cross the bridge; main reads and validates them.
  previewSkillFiles: (files) => call(IPC.skillsPreview, files.map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
  installSkills: (tokens) => call(IPC.skillsInstall, tokens),
  getSkill: (id) => call(IPC.skillsGet, id),
  saveSkill: (draft) => call(IPC.skillsSave, draft),
  deleteSkill: (id) => call(IPC.skillsDelete, id),
  showSkillsFolder: () => call(IPC.skillsShowFolder),

  respondOffer: (id, choice) => call(IPC.offerRespond, id, choice),

  requestMic: () => call(IPC.micAccess),
launcherHide: () => call(IPC.launcherHide),
  warmUpSpeech: () => call(IPC.speechWarmUp),
  transcribe: (audio) => call(IPC.speechTranscribe, audio),
  suggest: (text) => call(IPC.suggest, text),
  listConversations: (query) => call(IPC.convList, query),
  getConversation: (id) => call(IPC.convGet, id),
  saveConversation: (id, messages) => call(IPC.convSave, id, messages),
  deleteConversation: (id) => call(IPC.convDelete, id),
  renameConversation: (id, title) => call(IPC.convRename, id, title),
  synthesize: (text, voice, rate) => call(IPC.ttsSynthesize, text, voice, rate),
  warmUpTts: () => call(IPC.ttsWarmUp),
  openVoiceSettings: () => call(IPC.openVoiceSettings),
  setVoiceStatus: (status) => call(IPC.voiceStatus, status),
  setFloatExpanded: (size) => call(IPC.floatExpand, size),
  focusFloat: () => call(IPC.floatFocus),
  startTask: (prompt, source) => call(IPC.taskStart, prompt, source),
  listTasks: () => call(IPC.taskList),
  stopTask: (id) => call(IPC.taskStop, id),
  retryTask: (id) => call(IPC.taskRetry, id),
  replyToTask: (id, text) => call(IPC.taskReply, id, text),
  deleteTask: (id) => call(IPC.taskDelete, id),
  clearFinishedTasks: () => call(IPC.taskClearFinished),
  openEcospace: () => call(IPC.openEcospace),
  askInChat: (text) => call(IPC.askInChat, text),
  toggleVoice: () => call(IPC.voiceToggle),
  voiceReview: (action) => call(IPC.voiceReview, action),

  composeChoose: (index) => call(IPC.composeChoose, index),
  composeCancel: () => call(IPC.composeCancel),
  composeAction: () => call(IPC.composeAction),
  composeAccess: (prompt) => call(IPC.composeAccess, prompt),

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
