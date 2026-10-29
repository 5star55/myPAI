import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PERMISSION_KEYS } from '@shared/ipc'
import { defaultProfile, profileStore } from '../src/main/store/profile'
import type { TestState } from './setup'

const state = (globalThis as { __pai?: TestState }).__pai!
export const TMP = state.TMP
export const permissionLog = state.permissionLog
const responder = state.responder

/** Create files (relative to TMP). */
export function makeFiles(files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(TMP, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
}

/** Approve folders and switch every permission on (tests switch off what they need). */
export function useProfile(folders: string[], overrides: Partial<Record<(typeof PERMISSION_KEYS)[number], boolean>> = {}): void {
  const p = defaultProfile()
  p.approvedFolders = folders.map((f) => join(TMP, f))
  p.folderAccess = 'approved' // most tests check the strict allowlist; "all folders" has its own tests
  for (const k of PERMISSION_KEYS) p.permissions[k] = true
  Object.assign(p.permissions, overrides)
  profileStore.set(p)
}

export function resetPermissionsLog(answer: typeof responder.answer = () => ({ allow: true })): void {
  permissionLog.length = 0
  responder.answer = answer
}

