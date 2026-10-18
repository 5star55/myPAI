import { mkdirSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { checkPath, type PathCheck } from '../src/main/security/allowlist'
import { TMP, makeFiles, useProfile } from './helpers'

const inside = (r: PathCheck) => r.ok && r.folder !== null
const outside = (r: PathCheck) => r.ok && r.folder === null && r.outsideFolder !== null
const refused = (r: PathCheck) => !r.ok

describe('folder allowlist', () => {
  beforeAll(() => {
    makeFiles({ 'approved/a.txt': 'a', 'approved2/b.txt': 'b', 'secret/key.txt': 'secret' })
    symlinkSync(join(TMP, 'secret'), join(TMP, 'approved/link'))
    mkdirSync(join(TMP, 'approved/sub'))
    useProfile(['approved'])
  })

  it('files inside an approved folder are "inside"', () => {
    expect(inside(checkPath(join(TMP, 'approved/a.txt'), { mustExist: true }))).toBe(true)
    expect(inside(checkPath(join(TMP, 'approved')))).toBe(true)
    expect(inside(checkPath(join(TMP, 'approved/sub/new-file.txt')))).toBe(true)
  })

  it('other paths are "outside" (allowed only after a warning dialog), with the folder to approve', () => {
    const r = checkPath(join(TMP, 'secret/key.txt'))
    expect(outside(r)).toBe(true)
    expect(r.ok && r.outsideFolder).toBe(join(TMP, 'secret'))
    expect(outside(checkPath(join(TMP, 'secret'), { isFolder: true }))).toBe(true)
  })

  it('../ traversal, name-prefix lookalikes and symlinks cannot sneak "inside"', () => {
    expect(outside(checkPath(join(TMP, 'approved/../secret/key.txt')))).toBe(true)
    expect(outside(checkPath(`${TMP}/approved/sub/../../secret/key.txt`))).toBe(true)
    expect(outside(checkPath(join(TMP, 'approved2/b.txt')))).toBe(true)
    const viaLink = checkPath(join(TMP, 'approved/link/key.txt'))
    expect(outside(viaLink)).toBe(true)
    expect(viaLink.ok && viaLink.path).toBe(join(TMP, 'secret/key.txt')) // the dialog shows the REAL path
  })

  it('protected places are refused, even with permission', () => {
    expect(refused(checkPath(join(TMP, 'userData/approvals.json')))).toBe(true) // pai's own data
    expect(refused(checkPath(join(process.cwd(), '.env')))).toBe(true) // pai's code and keys
    expect(refused(checkPath(join(homedir(), '.ssh/id_rsa')))).toBe(true)
    expect(refused(checkPath('/'))).toBe(true)
    if (process.platform !== 'win32') expect(refused(checkPath('/etc/passwd'))).toBe(true)
  })

  it('a symlink pointing into a protected place is refused', () => {
    mkdirSync(join(TMP, 'userData'), { recursive: true })
    symlinkSync(join(TMP, 'userData'), join(TMP, 'approved/sneaky'))
    expect(refused(checkPath(join(TMP, 'approved/sneaky/profile.json')))).toBe(true)
  })

  it('rejects relative paths, empty input and null bytes', () => {
    expect(refused(checkPath('approved/a.txt'))).toBe(true)
    expect(refused(checkPath(''))).toBe(true)
    expect(refused(checkPath(42))).toBe(true)
    expect(refused(checkPath(`${TMP}/approved/a.txt\0`))).toBe(true)
  })

  it('with no approved folders, everything is outside', () => {
    useProfile([])
    expect(outside(checkPath(join(TMP, 'approved/a.txt')))).toBe(true)
    useProfile(['approved'])
  })
})
