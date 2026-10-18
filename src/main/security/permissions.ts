/**
 * permissions.ts — asks the user before ANY tool runs.
 *
 * Flow for one action:
 *   1. Off switch on?            -> refuse.
 *   2. Already approved?         -> allow (session approval or "always").
 *      Never for actions OUTSIDE the approved folders: those always ask,
 *      and the user may add the folder to the approved list from the dialog.
 *   3. Show the dialog in the chat window and wait for the answer.
 *   4. Destructive (delete/overwrite)? -> a SECOND, separate confirmation,
 *      and it is never remembered.
 *
 * No answer within 2 minutes counts as "deny".
 */
import { randomUUID } from 'node:crypto'
import type { PermissionRequest, PermissionResponse } from '@shared/ipc'
import { addAlways, hasAlways } from '../store/approvals'
import { normalizeFolder, profileStore } from '../store/profile'
import { broadcast } from '../windows/common'
import { isEnabled } from '../store/state'
import { getChatWindow, showChat } from '../windows/chatWindow'

const TIMEOUT_MS = 120_000

export interface PermissionAsk {
  tool: string
  action: string
  target: string
  destructive: boolean
  /** Approved folder the target is in (path tools only). */
  folder?: string
  /** Non-path tools: what a session approval covers (e.g. one app name). */
  scope?: string
  /** Folders outside the allowlist that this action touches. */
  outsideFolders?: string[]
}

/** Approvals that last until the app quits. */
const sessionApprovals = new Set<string>()

interface Pending {
  resolve: (res: PermissionResponse) => void
  timer: NodeJS.Timeout
}
const pending = new Map<string, Pending>()

const keyFor = (ask: PermissionAsk): string => `${ask.tool}|${ask.folder ?? ask.scope ?? '*'}`

export async function requestPermission(ask: PermissionAsk, signal?: AbortSignal): Promise<boolean> {
  if (!isEnabled()) return false

  const outside = ask.outsideFolders ?? []
  const key = keyFor(ask)
  if (!ask.destructive && !outside.length && (sessionApprovals.has(key) || hasAlways(key))) return true

  const first = await prompt(ask, 'ask', signal)
  if (!first.allow) return false
  if (outside.length && first.approveFolders) approveFolders(outside)

  if (ask.destructive) {
    const second = await prompt(ask, 'confirm', signal)
    return second.allow && isEnabled()
  }

  // "Allow once" outside the approved folders is never remembered.
  if (outside.length) return isEnabled()
  sessionApprovals.add(key)
  if (first.always && ask.folder) addAlways(key)
  return isEnabled()
}

/** The user ticked "add to approved folders" in an outside-folder dialog. */
function approveFolders(folders: string[]): void {
  profileStore.update((p) => ({ ...p, approvedFolders: [...new Set([...p.approvedFolders, ...folders.map(normalizeFolder)])] }))
  broadcast('data:changed', { what: 'profile' })
}

function prompt(ask: PermissionAsk, stage: PermissionRequest['stage'], signal?: AbortSignal): Promise<PermissionResponse> {
  const deny = (id: string): PermissionResponse => ({ id, allow: false, always: false, approveFolders: false })
  const id = randomUUID()
  if (signal?.aborted) return Promise.resolve(deny(id))

  const request: PermissionRequest = {
    id,
    tool: ask.tool,
    action: ask.action,
    target: ask.target,
    stage,
    destructive: ask.destructive,
    canRemember: !ask.destructive && !!ask.folder && !ask.outsideFolders?.length,
    folder: ask.folder,
    outside: ask.outsideFolders?.length ? ask.outsideFolders : undefined
  }

  return new Promise((resolve) => {
    const finish = (res: PermissionResponse): void => {
      const p = pending.get(id)
      if (!p) return
      clearTimeout(p.timer)
      pending.delete(id)
      getChatWindow()?.webContents.send('permission:cancel', { id })
      resolve(res)
    }
    pending.set(id, { resolve: finish, timer: setTimeout(() => finish(deny(id)), TIMEOUT_MS) })
    signal?.addEventListener('abort', () => finish(deny(id)), { once: true })

    const win = showChat()
    const send = (): void => win.webContents.send('permission:request', request)
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
    else send()
  })
}

/** Called by IPC when the user clicks a button. Unknown ids are ignored. */
export function respondPermission(raw: unknown): void {
  const res = raw as PermissionResponse
  if (typeof res?.id !== 'string') return
  pending.get(res.id)?.resolve({
    id: res.id,
    allow: res.allow === true,
    always: res.always === true,
    approveFolders: res.approveFolders === true
  })
}

/** Off switch: deny everything that is waiting and forget session approvals. */
export function denyAllPending(): void {
  for (const [id, p] of pending) p.resolve({ id, allow: false, always: false })
  sessionApprovals.clear()
}
