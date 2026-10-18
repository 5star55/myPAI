/**
 * Test setup: replaces Electron with a small fake so main-process code can be
 * tested with plain Node. Every test file gets its own temp folder.
 */
import { mkdirSync, mkdtempSync, realpathSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { vi } from 'vitest'

process.env.MODEL_MODE = 'mock'

const TMP = realpathSync(mkdtempSync(join(tmpdir(), 'pai-test-')))
const trash = join(TMP, '.trash')
mkdirSync(trash, { recursive: true })

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => join(TMP, name === 'downloads' ? 'Downloads' : name),
    getAppPath: () => process.cwd(),
    isPackaged: false
  },
  shell: {
    // "Trash" = move into TMP/.trash so tests can check nothing is really deleted.
    trashItem: async (p: string) => renameSync(p, join(trash, `${Date.now()}-${basename(p)}`)),
    openExternal: async () => {}
  },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  Notification: class {
    static isSupported = () => false
    on() {}
    show() {}
  },
  ipcMain: { handle: () => {} },
  dialog: {},
  Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
  screen: {}
}))

// Shared test state lives on globalThis so helpers see the same objects as the mocks.
export interface TestState {
  TMP: string
  permissionLog: { stage: string; target: string; outside?: string[] }[]
  responder: { answer: (req: { stage: string }) => { allow: boolean; always?: boolean; approveFolders?: boolean } }
}
const state: TestState = { TMP, permissionLog: [], responder: { answer: () => ({ allow: true }) } }
;(globalThis as { __pai?: TestState }).__pai = state

// A fake chat window that records permission requests and lets tests answer them.
vi.mock('../src/main/windows/chatWindow', () => {
  const win = {
    webContents: {
      isLoading: () => false,
      send: (channel: string, req: { id: string; stage: string; target: string; outside?: string[] }) => {
        if (channel !== 'permission:request') return
        const t = (globalThis as { __pai?: TestState }).__pai!
        t.permissionLog.push({ stage: req.stage, target: req.target, outside: req.outside })
        const a = t.responder.answer(req)
        // Imported lazily: a static import here would be circular (permissions imports this module).
        setTimeout(async () => {
          const { respondPermission } = await import('../src/main/security/permissions')
          respondPermission({ id: req.id, allow: a.allow, always: a.always ?? false, approveFolders: a.approveFolders ?? false })
        }, 0)
      }
    }
  }
  return { getChatWindow: () => win, showChat: () => win, showChatInactive: () => win, ensureChatWindow: () => win, toggleChat: () => {} }
})
