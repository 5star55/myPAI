import { Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { app } from 'electron'
import type { FloatMenuActions } from './floatWindow'

let tray: Tray | null = null

/** A menu-bar (macOS) or notification-area (Windows) icon with the same actions as the orb's right-click menu. */
export function createTray(actions: FloatMenuActions): Tray | null {
  const iconPath = join(app.getAppPath(), 'resources/tray.png')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    console.warn(`[tray] icon not found at ${iconPath}; the tray icon is not shown`)
    return null
  }
  if (process.platform === 'darwin') image.setTemplateImage(true)
  tray?.destroy()
  tray = new Tray(image)
  tray.setToolTip('pai')
  rebuild(actions)
  return tray
}

/** Rebuild the menu so the ON/OFF and Quiet labels stay current each time it opens. */
function rebuild(actions: FloatMenuActions): void {
  if (!tray) return
  const enabled = actions.isEnabled()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Talk to me', click: actions.talk, enabled },
      { label: 'Open Ecospace', click: actions.openEcospace },
      { label: 'Open / close chat', click: actions.toggleChat },
      { type: 'separator' },
      { label: enabled ? 'Turn assistant OFF' : 'Turn assistant ON', click: () => { actions.setEnabled(!enabled); rebuild(actions) } },
      { label: 'Quiet mode', type: 'checkbox', checked: actions.isQuiet(), click: (item) => actions.setQuiet(item.checked) },
      { type: 'separator' },
      { label: 'Quit pai', click: actions.quit }
    ])
  )
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}