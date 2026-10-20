import { describe, expect, it } from 'vitest'
import { pickPlatform } from '../src/main/platform'

describe('platform layer', () => {
  it('picks the right system', () => {
    expect(pickPlatform('darwin').id).toBe('mac')
    expect(pickPlatform('win32').id).toBe('windows')
    expect(pickPlatform('linux').id).toBe('linux')
  })

  it('says what each system supports', () => {
    expect(pickPlatform('darwin').supports.completeText).toBe(true)
    expect(pickPlatform('win32').supports.completeText).toBe(false)
  })

  it('unsupported systems fail cleanly instead of throwing', async () => {
    const p = pickPlatform('win32')
    expect(p.text.available()).toBe(false)
    expect(await p.text.readField()).toMatchObject({ ok: false })
    expect(p.text.unavailableMessage()).toContain('macOS')
  })
})