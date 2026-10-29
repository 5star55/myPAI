/**
 * settingsPage.ts — open_settings_page. The model picks a page name from a fixed
 * list; it never passes a command or a URL. Uses execFile (no shell).
 */
import { execFile } from 'node:child_process'
import { needString, type Tool } from './types'

/** The only settings pages pai may open. */
const PAGES: Record<string, { mac: string; win: string }> = {
  notifications: { mac: 'x-apple.systempreferences:com.apple.preference.notifications', win: 'ms-settings:notifications' },
  microphone: { mac: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone', win: 'ms-settings:privacy-microphone' },
  sound: { mac: 'x-apple.systempreferences:com.apple.preference.sound', win: 'ms-settings:sound' },
  privacy: { mac: 'x-apple.systempreferences:com.apple.preference.security', win: 'ms-settings:privacy' }
}
const PAGE_NAMES = Object.keys(PAGES)

/** The URL for a page on this system, or null if the page or the system isn't supported. */
export function settingsUrl(page: string, platform: NodeJS.Platform = process.platform): string | null {
  if (!Object.hasOwn(PAGES, page)) return null
  if (platform === 'darwin') return PAGES[page].mac
  if (platform === 'win32') return PAGES[page].win
  return null
}

function openUrl(url: string): Promise<void> {
  // explorer.exe exits with 1 even when it worked, so use `start` like open_app does.
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : ['cmd.exe', ['/d', '/c', 'start', '""', url]]
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15_000, windowsHide: true }, (err) =>
      err ? reject(new Error("Couldn't open that settings page.")) : resolve()
    )
  })
}

export const openSettingsPage: Tool = {
  name: 'open_settings_page',
  description: `Open a system settings page. Pages: ${PAGE_NAMES.join(', ')}.`,
  permission: 'apps',
  parameters: {
    type: 'object',
    properties: { page: { type: 'string', description: 'The settings page to open', enum: PAGE_NAMES } },
    required: ['page']
  },
  prepare(args) {
    const page = needString(args, 'page', 40).toLowerCase()
    if (!Object.hasOwn(PAGES, page)) return { error: `"${page}" isn't a settings page pai can open. Pages: ${PAGE_NAMES.join(', ')}.` }
    const url = settingsUrl(page)
    if (!url) return { error: "Opening settings pages isn't supported on this system yet." }
    return {
      action: 'Open a system settings page',
      target: page,
      rememberScope: `settings:${page}`,
      run: async () => {
        await openUrl(url)
        return `Opened the ${page} settings.`
      }
    }
  }
}
