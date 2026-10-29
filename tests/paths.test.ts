import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkPath, cleanPathInput } from '../src/main/security/allowlist'
import { defaultProfile, profileStore } from '../src/main/store/profile'
import { TMP, makeFiles } from './helpers'

beforeEach(() => {
  makeFiles({ 'Desktop/brand images/IMG_6973.png': 'x', 'Desktop/notes.txt': 'n' })
  profileStore.set({ ...defaultProfile() }) // all folders
})

describe('paths written like a shell would', () => {
  it.skipIf(process.platform === 'win32')('undoes quotes and backslash-escaped spaces', () => {
    expect(cleanPathInput('~/Desktop/brand\\ images')).toBe('~/Desktop/brand images')
    expect(cleanPathInput('~/Desktop/"brand images"/a.png')).toBe('~/Desktop/brand images/a.png')
    expect(cleanPathInput('"~/Desktop/brand images/"')).toBe('~/Desktop/brand images')
  })

  it.skipIf(process.platform === 'win32')('finds the real folder from those spellings', () => {
    expect(checkPath(join(TMP, 'Desktop/brand\\ images'), { mustExist: true }).ok).toBe(true)
    expect(checkPath(`${join(TMP, 'Desktop')}/"brand images"`, { mustExist: true }).ok).toBe(true)
  })

  it('suggests the closest real name instead of a bare "does not exist"', () => {
    const r = checkPath(join(TMP, 'Desktop/brand-images/IMG_6973.png'), { mustExist: true })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('Did you mean')
    expect(!r.ok && r.error).toContain('brand images')
  })

  it('lists the folder when nothing is close', () => {
    const r = checkPath(join(TMP, 'Desktop/zzz'), { mustExist: true })
    expect(!r.ok && r.error).toContain('contains:')
    expect(!r.ok && r.error).toContain('notes.txt')
  })
})
