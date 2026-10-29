/**
 * shell.ts — run_command: run a terminal command and report its output.
 *
 * How it's approved depends on Settings → Terminal commands:
 *   'ask'  — every command shows a dialog with the exact command and folder.
 *   'auto' — "run and report": normal commands run straight away and are shown
 *            in the chat + activity log.
 * In BOTH modes, risky commands (sudo, rm -r, curl | sh, …) need a red double
 * confirmation, commands outside approved folders ask with a warning, and
 * commands that touch pai's own files or your keys are refused.
 *
 * Commands get a clean environment (no API keys), a timeout, and are killed
 * together with anything they started when you press Stop or the off switch.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { app } from 'electron'
import { dataDir } from '../paths'
import { checkPath } from '../security/allowlist'
import { addWorkspace, inWorkspace } from '../store/workspaces'
import { profileStore } from '../store/profile'
import { needString, outsideOf, type Tool, type ToolOutput } from './types'

const DEFAULT_TIMEOUT_S = 60
const MAX_TIMEOUT_S = 300
const MAX_OUTPUT = 50_000
/** Package installs and scaffolding (create-next-app, npm install, pip install…). */
const SLOW_COMMAND = /\b(create-[\w-]+|npm\s+(i|install|ci|create|init)|npx\s+(--yes\s+)?create|yarn(\s+(install|add|create))?\s*($|&&|;)|pnpm\s+(i|install|add|create|dlx)|bun\s+(i|install|create)|pip3?\s+install|poetry\s+install|cargo\s+build|brew\s+install|composer\s+install)/i

/** Commands that can do serious damage or reach beyond the computer. */
const RISKY: { re: RegExp; why: string }[] = [
  { re: /\bsudo\b|\bdoas\b/, why: 'runs as administrator' },
  { re: /\brm\s+(-\w*\s+)*-\w*[rRf]/, why: 'deletes files permanently (rm -r / -f)' },
  { re: /\b(mkfs|fdisk|diskutil\s+(erase|partition|zero)|format\s+[a-z]:)/i, why: 'can erase a disk' },
  { re: /\bdd\s+[^|]*\bof=/, why: 'writes raw data to a device or file' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/, why: 'shuts down or restarts the computer' },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}/, why: 'is a fork bomb' },
  { re: /\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\|\s*(python3?|perl|ruby|node)\b/i, why: 'downloads and runs code' },
  { re: /\bchmod\s+(-R\s+)?[0-7]*777\b|\bchown\s+-R\b/, why: 'changes permissions broadly' },
  { re: /\bgit\s+(push\b.*(--force|-f\b)|reset\s+--hard|clean\s+-\w*f)/, why: 'can lose git history or work' },
  { re: /\b(npm|yarn|pnpm)\s+publish\b|\bgit\s+push\b/, why: 'publishes to the internet' },
  { re: /\bcrontab\s+-r\b|\blaunchctl\b|\bsystemctl\b|\bdefaults\s+write\b|\breg\s+(add|delete)\b/, why: 'changes system settings' },
  { re: /\bkill(all)?\s|\bpkill\b/, why: 'stops other programs' },
  { re: /\bosascript\b/, why: 'can control other apps' },
  { re: /\b(Remove-Item|rd|rmdir|del)\b.*(-Recurse|\/s)/i, why: 'deletes folders permanently' }
]

/** Seconds a command may run: installs and project generators routinely take minutes, so they always get the full time. */
export function commandTimeout(command: string, requested: unknown): number {
  const floor = SLOW_COMMAND.test(command) ? MAX_TIMEOUT_S : 1
  return Math.min(MAX_TIMEOUT_S, Math.max(floor, Number(requested) || DEFAULT_TIMEOUT_S))
}

export function riskOf(command: string): string | null {
  for (const r of RISKY) if (r.re.test(command)) return r.why
  return null
}

/** Commands may never touch pai's own data/code or common secret stores. */
export function touchesProtected(command: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\\/g, '/')
  const lower = norm(command)
  const home = norm(homedir())
  const paths = [dataDir(), app.getAppPath()].map(norm)
  if (paths.some((p) => lower.includes(p))) return true
  if (/(^|[\s'"/])\.env\b/.test(lower)) return true
  if (/(~|\$home|\$\{home\}|\$env:(userprofile|home)|%userprofile%)\/\.(ssh|gnupg|aws)\b|keychains/.test(lower) || [`${home}/.ssh`, `${home}/.gnupg`, `${home}/.aws`].some((p) => lower.includes(p))) return true
  if (/\bsecurity\s+(find|dump|export)-/.test(lower)) return true // macOS keychain reading
  return false
}

/** A copy of the environment without secrets (pai's API keys never reach commands). */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL/i.test(k)) continue
    if (/^(MODEL_|TAVILY_|ELECTRON_|PAI_)/.test(k)) continue
    env[k] = v
  }
  return env
}

/** The folder names directly inside `dir`. */
function foldersIn(dir: string): Set<string> {
  try {
    return new Set(readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name))
  } catch {
    return new Set()
  }
}

export function shellFor(): [string, string[]] {
  if (process.platform === 'win32') return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command']]
  // A login shell, so PATH includes things like Homebrew.
  return [process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : '/bin/sh', ['-lc']]
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly output: string
  ) {
    super(message)
  }
}

/** Stop a command started with detached: true, and everything it started. */
export function killTree(child: ChildProcess): void {
  try {
    if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
    else child.kill()
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }, 2000)
}

function runShell(command: string, cwd: string, timeoutS: number, signal: AbortSignal): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const [sh, args] = shellFor()
    const child = spawn(sh, [...args, command], {
      cwd,
      env: cleanEnv(),
      detached: process.platform !== 'win32', // own process group, so we can stop everything it started
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    let truncated = false
    const add = (chunk: Buffer) => {
      if (output.length >= MAX_OUTPUT) return void (truncated = true)
      output += chunk.toString('utf8')
    }
    child.stdout.on('data', add)
    child.stderr.on('data', add)

    const kill = () => killTree(child)
    let reason: string | null = null
    const timer = setTimeout(() => {
      reason = `Stopped after ${timeoutS}s (time limit).`
      kill()
    }, timeoutS * 1000)
    const onAbort = () => {
      reason = 'Stopped.'
      kill()
    }
    signal.addEventListener('abort', onAbort, { once: true })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new CommandError(`Couldn't start the command: ${err.message}`, ''))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      const out = (output.trimEnd() || '(no output)') + (truncated ? '\n…(output truncated)' : '')
      if (reason) reject(new CommandError(reason, out))
      else resolve({ code: code ?? -1, output: out })
    })
  })
}

export const runCommand: Tool = {
  name: 'run_command',
  description:
    'Run a terminal command (macOS/Linux: zsh/sh; Windows: PowerShell) in a folder and wait for its output: installs, scaffolding, builds, tests, git, scripts. Never use it for dev servers or watchers (they never finish): use start_server. Prefer the file tools for file changes.',
  permission: 'shell',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The exact command to run' },
      cwd: { type: 'string', description: 'Full path of the folder to run it in (default: your first approved folder)' },
      timeout_seconds: { type: 'number', description: `Time limit in seconds (default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S})` }
    },
    required: ['command']
  },
  prepare(args) {
    const command = needString(args, 'command', 2000)
    if (command.includes('\0')) return { error: 'Invalid command.' }
    if (touchesProtected(command)) {
      return { error: "That command touches pai's own files or your keys/secrets, so it is not allowed." }
    }
    const profile = profileStore.get()
    const cwdInput = typeof args.cwd === 'string' && args.cwd.trim() ? args.cwd : (profile.approvedFolders[0] ?? homedir())
    const check = checkPath(cwdInput, { mustExist: true, isFolder: true })
    if (!check.ok) return { error: check.error }
    if (!statSync(check.path).isDirectory()) return { error: `"${check.path}" is not a folder.` }
    const timeoutS = commandTimeout(command, args.timeout_seconds)

    const risk = riskOf(command)
    const outside = outsideOf(check)
    return {
      action: risk ? `Run a RISKY command (it ${risk})` : 'Run a command',
      target: `${command}   (in ${check.path})`,
      preview: `$ ${command}`,
      destructive: !!risk,
      folder: check.folder ?? undefined,
      outsideFolders: outside,
      neverRemember: true,
      // "Run and report", or a project pai created: normal commands skip the dialog (risky ones never do).
      autoApprove: (profile.commandMode === 'auto' || inWorkspace(check.path)) && !risk && !outside,
      run: async (signal): Promise<ToolOutput> => {
        const before = foldersIn(check.path)
        const result = await runShell(command, check.path, timeoutS, signal).finally(() => {
          // Folders the command made (a scaffolded project…) are pai's own work from now on.
          for (const f of foldersIn(check.path)) if (!before.has(f)) addWorkspace(join(check.path, f))
        })
        const { code, output } = result
        const summary = code === 0 ? 'exit 0' : `exit code ${code}`
        if (code !== 0) throw new CommandError(`The command failed (${summary}).`, output)
        return { text: `$ ${command}\n(in ${check.path}, ${summary})\n${output}`, output }
      }
    }
  }
}
