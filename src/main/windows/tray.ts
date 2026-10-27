/**
 * tray.ts — a menu-bar (macOS) or notification-area (Windows) icon with the
 * same actions as the orb's right-click menu.
 */
import { join } from 'node:path'
import { app, Menu, nativeImage, Tray } from 'electron'
import type { FloatMenuActions } from './floatWindow'

let tray: Tray | null = null
let menuActions: FloatMenuActions | null = null

export function createTray(actions: FloatMenuActions): Tray | null {
  // tray@2x.png sits next to tray.png and is picked up automatically on high-DPI screens.
  const iconPath = join(app.getAppPath(), 'resources/tray.png')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    console.warn(`[tray] icon not found at ${iconPath}; the tray icon is not shown`)
    return null
  }
  tray?.destroy()
  tray = new Tray(image)
  tray.setToolTip('pai')
  menuActions = actions
  refreshTray()
  return tray
}

/** Rebuild the menu so the ON/OFF and Quiet labels match the current state. Call after either changes. */
export function refreshTray(): void {
  const actions = menuActions
  if (!tray || !actions) return
  const enabled = actions.isEnabled()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Talk to me', click: actions.talk, enabled },
      { label: 'Open Ecospace', click: actions.openEcospace },
      { label: 'Open / close chat', click: actions.toggleChat },
      { type: 'separator' },
      { label: enabled ? 'Turn assistant OFF' : 'Turn assistant ON', click: () => actions.setEnabled(!enabled) },
      { label: 'Quiet mode', type: 'checkbox', checked: actions.isQuiet(), click: (item) => actions.setQuiet(item.checked) },
      { type: 'separator' },
      { label: 'Quit pai', click: actions.quit }
    ])
  )
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
  menuActions = null
}
