import { homedir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkPath, realPath, scopeFor } from '../src/main/security/allowlist'
import { dataFile } from '../src/main/paths'
import { defaultProfile, profileStore, sanitizeProfile } from '../src/main/store/profile'
import { TMP, makeFiles } from './helpers'

beforeEach(() => {
  makeFiles({ 'anywhere/project/a.txt': 'a' })
  profileStore.set({ ...defaultProfile(), approvedFolders: [] })
})

describe('Allow all folders', () => {
  it('is on by default, also for existing profiles', () => {
    expect(defaultProfile().folderAccess).toBe('all')
    expect(sanitizeProfile({ approvedFolders: [] }).folderAccess).toBe('all')
    expect(sanitizeProfile({ folderAccess: 'approved' }).folderAccess).toBe('approved')
  })

  it('allows any folder without the outside warning', () => {
    const r = checkPath(join(TMP, 'anywhere/project/a.txt'), { mustExist: true })
    expect(r).toMatchObject({ ok: true, outsideFolder: null })
  })

  it('still refuses protected places', () => {
    expect(checkPath(dataFile('profile.json')).ok).toBe(false)
    expect(checkPath('~/.ssh/id_rsa').ok).toBe(false)
    expect(checkPath('/').ok).toBe(false)
  })

  it('warns again when switched back to approved folders only', () => {
    profileStore.set({ ...profileStore.get(), folderAccess: 'approved' })
    const r = checkPath(join(TMP, 'anywhere/project/a.txt'))
    expect(r.ok && r.outsideFolder).toBeTruthy()
  })

  it('remembers approvals for a top folder, never home or a drive', () => {
    const home = realPath(homedir())
    expect(scopeFor(join(home, 'Projects/site/src/a.ts'))).toBe(join(home, 'Projects'))
    expect(scopeFor(join(home, 'notes.txt'))).toBeNull()
    expect(scopeFor(join(home, 'Projects'), true)).toBe(join(home, 'Projects'))
  })

  it.skipIf(process.platform === 'win32')('outside home, remembers two levels deep (e.g. an external drive)', () => {
    expect(scopeFor('/Volumes/Drive/work/a.txt')).toBe('/Volumes/Drive')
    expect(scopeFor('/Volumes/a.txt')).toBeNull()
  })
})
