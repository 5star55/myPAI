/**
 * apps.ts — open_app. Uses execFile (no shell), and the name is checked
 * against a strict pattern, so it cannot be used to run arbitrary commands.
 */
import { execFile } from 'node:child_process'
import { needString, type Tool } from './types'

const SAFE_APP_NAME = /^[\p{L}\p{N} ._+\-]{1,60}$/u

function launch(name: string): Promise<void> {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', ['-a', name]]
      : process.platform === 'win32'
        ? ['cmd.exe', ['/d', '/c', 'start', '""', name]]
        : ['gtk-launch', [name]]
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15_000, windowsHide: true }, (err) =>
      err ? reject(new Error(`Couldn't open an app called "${name}". Check the exact name.`)) : resolve()
    )
  })
}

export const openApp: Tool = {
  name: 'open_app',
  description: 'Open an installed application by its name, e.g. "Calculator", "Safari", "Notes".',
  permission: 'apps',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'The application name' } },
    required: ['name']
  },
  prepare(args) {
    const name = needString(args, 'name', 60)
    if (!SAFE_APP_NAME.test(name)) return { error: `"${name}" doesn't look like an app name.` }
    return {
      action: 'Open an app',
      target: name,
      rememberScope: name.toLowerCase(),
      run: async () => {
        await launch(name)
        return `Opened ${name}.`
      }
    }
  }
}
