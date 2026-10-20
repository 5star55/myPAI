import type { Platform, PlatformId } from './types'

/** Windows and Linux until their native helpers exist (tasks A2 and A3). */
export function unsupportedPlatform(id: Exclude<PlatformId, 'mac'>): Platform {
  return {
    id,
    supports: { completeText: false },
    text: {
      available: () => false,
      unavailableMessage: () => '“Complete my text” works on macOS only for now.',
      readField: async () => ({ ok: false, error: 'helper-missing' }),
      insertText: async () => ({ ok: false, error: 'helper-missing' }),
      isTrusted: async () => false,
      openPermissionSettings: async () => {},
      stop: () => {}
    }
  }
}