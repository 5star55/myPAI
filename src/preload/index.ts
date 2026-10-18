/**
 * Preload — the ONLY bridge between the React UI and the main process.
 * It exposes a small, typed API on window.pai. Nothing else leaks through.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PaiApi } from '@shared/ipc'

const api: PaiApi = {
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  sendChat: (history) => ipcRenderer.invoke(IPC.chatSend, history)
}

contextBridge.exposeInMainWorld('pai', api)
