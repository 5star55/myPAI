import type { Platform, PlatformId } from './types'

/** Systems without a native text helper yet (Linux until task A3). */
export function unsupportedPlatform(id: Exclude<PlatformId, 'mac'>): Platform {
  return {
    id,
    supports: { completeText: false },
    composeHotkey: { accelerator: 'Ctrl+Alt+Space', label: 'Ctrl+Alt+Space' },
    text: {
      available: () => false,
      unavailableMessage: () => '“Complete my text” works on macOS and Windows only for now.',
      readField: async () => ({ ok: false, error: 'helper-missing' }),
      insertText: async () => ({ ok: false, error: 'helper-missing' }),
      isTrusted: async () => false,
      openPermissionSettings: async () => {},
      stop: () => {}
    }
  }
}