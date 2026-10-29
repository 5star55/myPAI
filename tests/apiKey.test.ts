import { describe, expect, it } from 'vitest'
import { getConfig, getPublicConfig } from '../src/main/config'
import { checkKeyShape, maskKey, removeApiKey, saveApiKey, savedApiKey } from '../src/main/store/apiKey'
import { checkPath } from '../src/main/security/allowlist'
import { dataFile } from '../src/main/paths'
import { touchesProtected } from '../src/main/tools/shell'

describe('API key from Settings', () => {
  it('checks the shape of a pasted key', () => {
    expect(checkKeyShape('')).toMatch(/Paste/)
    expect(checkKeyShape('abc def ghi jkl mno pqr')).toMatch(/spaces/)
    expect(checkKeyShape('short')).toMatch(/full API key/)
    expect(checkKeyShape('a'.repeat(40))).toBeNull()
  })

  it('is saved in the data folder, wins over .env, and only its last 4 characters reach the UI', () => {
    const key = 'test-key-0123456789-abcd'
    saveApiKey(key)
    expect(savedApiKey()).toBe(key)
    expect(getConfig().apiKey).toBe(key)
    const pub = getPublicConfig()
    expect(JSON.stringify(pub)).not.toContain(key)
    expect(maskKey(key)).toBe('…abcd')
    removeApiKey()
    expect(savedApiKey()).toBe('')
  })

  it("can't be read by pai's tools or commands", () => {
    expect(checkPath(dataFile('api-key.bin')).ok).toBe(false)
    expect(touchesProtected(`cat "${dataFile('api-key.bin')}"`)).toBe(true)
  })
})
