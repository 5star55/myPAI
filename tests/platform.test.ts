import { describe, expect, it } from 'vitest'
import { helperAvailable } from '../src/main/compose/helper'
import { pickPlatform } from '../src/main/platform'
import { isNeverComposeApp } from '../src/shared/compose'

describe('platform layer', () => {
  it('picks the right system', () => {
    expect(pickPlatform('darwin').id).toBe('mac')
    expect(pickPlatform('win32').id).toBe('windows')
    expect(pickPlatform('linux').id).toBe('linux')
  })

  it('says what each system supports', () => {
    expect(pickPlatform('darwin').supports.completeText).toBe(true)
    // Windows only offers it once the text helper has been built.
    expect(pickPlatform('win32').supports.completeText).toBe(helperAvailable())
    expect(pickPlatform('linux').supports.completeText).toBe(false)
  })

  it('uses Ctrl+Alt+Space everywhere, never Alt+Space (taken by other apps / the Windows window menu)', () => {
    expect(pickPlatform('darwin').composeHotkey).toEqual({ accelerator: 'Control+Alt+Space', label: '⌃⌥Space' })
    expect(pickPlatform('win32').composeHotkey).toEqual({ accelerator: 'Control+Alt+Space', label: 'Ctrl+Alt+Space' })
  })

  it('unsupported systems fail cleanly instead of throwing', async () => {
    const p = pickPlatform('linux')
    expect(p.text.available()).toBe(false)
    expect(await p.text.readField()).toMatchObject({ ok: false })
    expect(p.text.unavailableMessage()).toContain('macOS')
  })

  it('never reads terminals or password managers, whatever the capitalisation', () => {
    for (const id of ['WindowsTerminal.exe', 'powershell.exe', 'KeePass.exe', '1Password.exe', 'com.apple.Terminal']) {
      expect(isNeverComposeApp(id)).toBe(true)
    }
    expect(isNeverComposeApp('notepad.exe')).toBe(false)
  })
})