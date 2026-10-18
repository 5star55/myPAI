/**
 * ipc.ts — the list of things the renderer is allowed to ask main to do.
 * Every handler returns a Result and never throws across the bridge.
 */
import { ipcMain } from 'electron'
import { IPC, type Result } from '@shared/ipc'
import { getPublicConfig } from './config'
import { sendChat } from './chat'

/** Register a handler; an unexpected exception becomes { ok: false } instead of a crash. */
function handle<T>(channel: string, fn: (...args: unknown[]) => Promise<Result<T>> | Result<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<Result<T>> => {
    try {
      return await fn(...args)
    } catch (err) {
      console.error(`[ipc] ${channel} failed:`, err)
      return { ok: false, error: 'Something went wrong inside pai. Check the terminal for details.' }
    }
  })
}

export function registerIpc(): void {
  handle(IPC.getConfig, () => ({ ok: true, value: getPublicConfig() }))
  handle(IPC.chatSend, (history) => sendChat(history))
}
