import { COMPOSE_HOTKEY, composeHotkeyLabel } from '@shared/compose'
import { helperAvailable, insertText, isTrusted, readField, stopHelper } from '../compose/helper'
import type { Platform } from './types'

export const windowsPlatform: Platform = {
  id: 'windows',
  supports: { completeText: true },
  composeHotkey: { accelerator: COMPOSE_HOTKEY, label: composeHotkeyLabel(false) }, // A5 will make this configurable
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