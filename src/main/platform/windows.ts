import { helperAvailable, insertText, isTrusted, readField, stopHelper } from '../compose/helper'
import type { Platform } from './types'

export const windowsPlatform: Platform = {
  id: 'windows',
  supports: { completeText: true },
  // Alt+Space opens the window menu on Windows, so use Ctrl+Alt+Space (A5 will make this configurable).
  composeHotkey: { accelerator: 'Ctrl+Alt+Space', label: 'Ctrl+Alt+Space' },
  text: {
    available: helperAvailable,
    unavailableMessage: () =>
      "The Windows text helper isn't built yet. In the project folder run: dotnet publish native/winhelper -c Release -r win-x64 --self-contained false -o native/bin   then restart pai.",
    readField,
    insertText,
    isTrusted, // Windows has no permission prompt for UI Automation; the helper just answers yes
    openPermissionSettings: async () => {},
    stop: stopHelper
  }
}