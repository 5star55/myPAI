import { execFile } from 'node:child_process'
import { needString, type Tool } from './types'

/** The only settings pages pai may open. Fixed list: the model picks a name, never a command. */
const PAGES: Record<string, { mac: string; win: string }> = {
  notifications: { mac: 'x-apple.systempreferences:com.apple.preference.notifications', win: 'ms-settings:notifications' },
  microphone: { mac: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone', win: 'ms-settings:privacy-microphone' },
  sound: { mac: 'x-apple.systempreferences:com.apple.preference.sound', win: 'ms-settings:sound' },
  privacy: { mac: 'x-apple.systempreferences:com.apple.preference.security', win: 'ms-settings:privacy' }
}

function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Windows: explorer.exe opens ms-settings: links without a shell.
    const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : ['explorer.exe', [url]]
    execFile(cmd, args, { timeout: 15_000, windowsHide: true }, (err) =>
      err ? reject(new Error("Couldn't open that settings page.")) : resolve()
    )
  })
}

export const openSettingsPage: Tool = {
  name: 'open_settings_page',
  description: `Open a system settings page. Pages: ${Object.keys(PAGES).join(', ')}.`,
  permission: 'apps',
  parameters: {
    type: 'object',
    properties: { page: { type: 'string', description: 'One of: ' + Object.keys(PAGES).join(', ') } },
    required: ['page']
  },
  prepare(args) {
    const page = needString(args, 'page', 40)
    const entry = PAGES[page]
    if (!entry) return { error: `"${page}" isn't a settings page pai can open.` }
    const url = process.platform === 'darwin' ? entry.mac : entry.win
    return {
      action: 'Open a system settings page',
      target: page,
      rememberScope: page,
      run: async () => {
        await openUrl(url)
        return `Opened the ${page} settings.`
      }
    }
  }
}