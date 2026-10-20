import { shell } from 'electron'
import { helperAvailable, insertText, isTrusted, readField, stopHelper } from '../compose/helper'
import type { Platform } from './types'

const ACCESSIBILITY_SETTINGS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

export const macPlatform: Platform = {
  id: 'mac',
  supports: { completeText: true },
  text: {
    available: helperAvailable,
    unavailableMessage: () =>
      "The text helper isn't built yet. Install Xcode's command line tools (xcode-select --install), then restart pai.",
    readField,
    insertText,
    isTrusted,
    openPermissionSettings: () => shell.openExternal(ACCESSIBILITY_SETTINGS),
    stop: stopHelper
  }
}