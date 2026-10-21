import { macPlatform } from './mac'
import type { Platform } from './types'
import { unsupportedPlatform } from './unsupported'
import { windowsPlatform } from './windows'

/** Pick the implementation for a system. Exported so tests can try every system. */
export function pickPlatform(name: NodeJS.Platform = process.platform): Platform {
  if (name === 'darwin') return macPlatform
  if (name === 'win32') return windowsPlatform
  return unsupportedPlatform('linux')
}

/** The one place the rest of the app asks "what can this system do?" */
export const platform: Platform = pickPlatform()
export type { Platform, PlatformId, TextAccess } from './types'