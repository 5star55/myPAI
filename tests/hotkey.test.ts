import { describe, expect, it } from 'vitest'
import { hotkeyLabelFor, isValidHotkey, sanitizeCompose } from '../src/shared/compose'

describe('Complete my text shortcut', () => {
  it('accepts shortcuts with at least one modifier', () => {
    expect(isValidHotkey('Control+Alt+Space')).toBe(true)
    expect(isValidHotkey('Control+Shift+K')).toBe(true)
  })

  it('rejects bare keys and repeated modifiers', () => {
    expect(isValidHotkey('Space')).toBe(false)
    expect(isValidHotkey('K')).toBe(false)
    expect(isValidHotkey('Foo+Space')).toBe(false)
    expect(isValidHotkey('Control+Control+K')).toBe(false)
  })

  it('only accepts keys Electron knows', () => {
    expect(isValidHotkey('Control+Alt+Up')).toBe(true)
    expect(isValidHotkey('Control+F12')).toBe(true)
    expect(isValidHotkey('Control+Banana')).toBe(false)
    expect(isValidHotkey('Control+ArrowUp')).toBe(false)
  })

  it('shows shortcuts the way each system writes them', () => {
    expect(hotkeyLabelFor('Control+Alt+Space', true)).toBe('⌃⌥Space')
    expect(hotkeyLabelFor('Control+Alt+Space', false)).toBe('Ctrl+Alt+Space')
  })

  it('falls back to the default when a saved shortcut is invalid', () => {
    expect(sanitizeCompose({ enabled: true, hotkey: 'Space' }).hotkey).toBe('Control+Alt+Space')
  })
})
