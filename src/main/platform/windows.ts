import { COMPOSE_HOTKEY, composeHotkeyLabel } from '@shared/compose'
import { helperAvailable, insertText, isTrusted, readField, stopHelper } from '../compose/helper'
import type { Platform } from './types'

export const windowsPlatform: Platform = {
  id: 'windows',
  // Only true when the helper exists, so a missing build shows the "not built yet" message.
  get supports() {
    return { completeText: helperAvailable() }
  },
  // Alt+Space opens the window menu on Windows, so use Ctrl+Alt+Space (A5 will make this configurable).
  composeHotkey: { accelerator: COMPOSE_HOTKEY, label: composeHotkeyLabel(false) },
  text: {
    available: helperAvailable,
    unavailableMessage: () =>
      'The Windows text helper is not built yet. Install the .NET 10 SDK, then run npm run build (or npm start) once.',
    readField,
    insertText,
    isTrusted,
    openPermissionSettings: async () => {},
    stop: stopHelper
  }
}
