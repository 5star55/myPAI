/**
 * servers.ts — dev servers and the preview browser.
 *
 *   start_server   run a command that keeps running (npm run dev, vite…) in the
 *                  background, wait for its local address, and open it in the preview
 *   server_output  the latest output of a running server (build errors…)
 *   stop_server    stop one
 *   open_preview   show a local page and report its title, text and console errors
 *
 * Starting a server goes through the same checks and approval as run_command.
 * Reading output, stopping pai's own servers and looking at local pages are
 * harmless, so they run without a dialog. Every server stops when pai quits.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { checkPath } from '../security/allowlist'
import { profileStore } from '../store/profile'
import { inspectPreview, localUrl, openPreview } from '../windows/previewWindow'
import { CommandError, cleanEnv, killTree, riskOf, shellFor, touchesProtected } from './shell'
import { needString, optString, outsideOf, type Tool } from './types'

interface Server {
  id: number
  command: string
  cwd: string
  child: ChildProcess
  log: string
  url: string | null
  /** Exit code once it has stopped (null while running). */
  exit: number | null
}

const MAX_LOG = 40_000
const DEFAULT_WAIT_S = 60
const MAX_WAIT_S = 180
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const URL_IN_OUTPUT = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):\d+[^\s'")\]]*/

const servers = new Map<number, Server>()
let nextId = 1

function startProcess(command: string, cwd: string): Server {
  const [sh, args] = shellFor()
  const child = spawn(sh, [...args, command], {
    cwd,
    // BROWSER=none: dev servers must not open the user's browser; the preview shows it.
    // PYTHONUNBUFFERED: Python holds its output back when it isn't a terminal, hiding the address.
    env: { ...cleanEnv(), BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1', PYTHONUNBUFFERED: '1' },
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const server: Server = { id: nextId++, command, cwd, child, log: '', url: null, exit: null }
  const add = (chunk: Buffer) => {
    server.log = (server.log + chunk.toString('utf8').replace(ANSI, '')).slice(-MAX_LOG)
    if (!server.url) {
      const found = URL_IN_OUTPUT.exec(server.log)?.[0].replace(/[.,;:]+$/, '')
      if (found) server.url = localUrl(found.replace('[::]', 'localhost'))
    }
  }
  child.stdout?.on('data', add)
  child.stderr?.on('data', add)
  child.on('error', (err) => {
    server.log += `\nCouldn't start: ${err.message}`
    server.exit = -1
  })
  child.on('exit', (code) => {
    server.exit = code ?? -1
  })
  servers.set(server.id, server)
  return server
}

/** Wait until the server prints its address, stops, or time runs out. */
async function waitForUrl(server: Server, seconds: number, signal: AbortSignal): Promise<void> {
  const until = Date.now() + seconds * 1000
  while (!server.url && server.exit === null && Date.now() < until && !signal.aborted) {
    await new Promise((r) => setTimeout(r, 250))
  }
}

const tail = (text: string, chars = 3000) => (text.length > chars ? `…${text.slice(-chars)}` : text).trim() || '(no output yet)'

function describe(s: Server): string {
  const status = s.exit === null ? (s.url ? `running at ${s.url}` : 'running') : `stopped (exit code ${s.exit})`
  return `Server #${s.id}: ${s.command} (in ${s.cwd}), ${status}`
}

/** The server a call means: the given id, or the newest one. */
function pick(id: unknown): Server | null {
  if (id !== undefined && id !== null && id !== '') return servers.get(Number(id)) ?? null
  return [...servers.values()].at(-1) ?? null
}

export function stopAllServers(): void {
  for (const s of servers.values()) if (s.exit === null) killTree(s.child)
}

export const startServer: Tool = {
  name: 'start_server',
  description:
    'Start a command that keeps running, like a dev server (npm run dev, npx vite, python -m http.server). It runs in the background; when it prints a local address it opens in the preview browser. Returns the address and the first output.',
  permission: 'shell',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command, e.g. "npm run dev"' },
      cwd: { type: 'string', description: 'Full path of the project folder' },
      wait_seconds: { type: 'number', description: `How long to wait for the address (default ${DEFAULT_WAIT_S}, max ${MAX_WAIT_S})` }
    },
    required: ['command', 'cwd']
  },
  prepare(args) {
    const command = needString(args, 'command', 1000)
    if (command.includes('\0')) return { error: 'Invalid command.' }
    if (touchesProtected(command)) return { error: "That command touches pai's own files or your keys/secrets, so it is not allowed." }
    const profile = profileStore.get()
    const check = checkPath(optString(args, 'cwd') ?? profile.approvedFolders[0] ?? homedir(), { mustExist: true, isFolder: true })
    if (!check.ok) return { error: check.error }
    if (!statSync(check.path).isDirectory()) return { error: `"${check.path}" is not a folder.` }
    const running = [...servers.values()].find((s) => s.exit === null && s.cwd === check.path && s.command === command)
    if (running) return { error: `${describe(running)} is already running. Use server_output to check it, or stop_server first.` }
    const waitS = Math.min(MAX_WAIT_S, Math.max(5, Number(args.wait_seconds) || DEFAULT_WAIT_S))
    const risk = riskOf(command)
    const outside = outsideOf(check)
    return {
      action: risk ? `Start a RISKY background command (it ${risk})` : 'Start a dev server (keeps running)',
      target: `${command}   (in ${check.path})`,
      preview: `$ ${command}`,
      destructive: !!risk,
      folder: check.folder ?? undefined,
      outsideFolders: outside,
      neverRemember: true,
      autoApprove: profile.commandMode === 'auto' && !risk && !outside,
      run: async (signal) => {
        const server = startProcess(command, check.path)
        await waitForUrl(server, waitS, signal)
        if (signal.aborted) {
          killTree(server.child)
          throw new CommandError('Stopped.', tail(server.log))
        }
        if (server.exit !== null) throw new CommandError(`The server stopped right away (exit code ${server.exit}).`, tail(server.log))
        if (!server.url) {
          return {
            text: `${describe(server)}. It has not printed a local address yet. Check again with server_output (id ${server.id}).\nOutput so far:\n${tail(server.log)}`,
            output: tail(server.log, 1500)
          }
        }
        let opened = 'Opened it in the preview.'
        try {
          await openPreview(server.url)
        } catch (err) {
          opened = `Could not open the preview: ${err instanceof Error ? err.message : String(err)}`
        }
        return {
          text: `${describe(server)}. ${opened} Use open_preview to check the page, server_output for build errors, stop_server (id ${server.id}) to stop it.\nOutput so far:\n${tail(server.log)}`,
          data: { kind: 'preview', url: server.url },
          output: tail(server.log, 1500)
        }
      }
    }
  }
}

export const serverOutput: Tool = {
  name: 'server_output',
  description: 'Show the latest output of a dev server started with start_server (build errors, warnings, requests). Without an id: the newest server.',
  permission: 'shell',
  parameters: {
    type: 'object',
    properties: { id: { type: 'number', description: 'Server id from start_server (optional)' } },
    required: []
  },
  prepare(args) {
    const server = pick(args.id)
    if (!server) return { error: servers.size ? `There is no server #${String(args.id)}.` : 'No servers are running. Start one with start_server.' }
    return {
      action: 'Read server output',
      target: `#${server.id} ${server.command}`,
      autoApprove: true,
      run: async () => {
        const others = [...servers.values()].filter((s) => s !== server && s.exit === null).map(describe)
        return {
          text: `${describe(server)}.\nLatest output:\n${tail(server.log, 5000)}${others.length ? `\nAlso running:\n${others.join('\n')}` : ''}`,
          output: tail(server.log, 1500)
        }
      }
    }
  }
}

export const stopServer: Tool = {
  name: 'stop_server',
  description: 'Stop a dev server started with start_server. Without an id: the newest one.',
  permission: 'shell',
  parameters: {
    type: 'object',
    properties: { id: { type: 'number', description: 'Server id from start_server (optional)' } },
    required: []
  },
  prepare(args) {
    const server = pick(args.id)
    if (!server) return { error: 'No such server.' }
    return {
      action: 'Stop a dev server',
      target: `#${server.id} ${server.command}`,
      autoApprove: true,
      run: async () => {
        if (server.exit !== null) return `${describe(server)} (already stopped).`
        killTree(server.child)
        servers.delete(server.id)
        return `Stopped server #${server.id} (${server.command}).`
      }
    }
  }
}

export const openPreviewTool: Tool = {
  name: 'open_preview',
  description:
    'Open a local page (e.g. http://localhost:3000/about) in the preview browser the user can see, and get back its title, visible text and console errors. Use it to check your work after changes.',
  permission: 'shell',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'A local address, e.g. http://localhost:3000' } },
    required: ['url']
  },
  prepare(args) {
    const url = localUrl(needString(args, 'url', 2000))
    if (!url) return { error: 'The preview only opens local addresses, like http://localhost:3000.' }
    return {
      action: 'Open the preview',
      target: url,
      autoApprove: true,
      run: async () => {
        await openPreview(url)
        const { state, text, problems } = await inspectPreview()
        const report = [
          `Preview of ${state.url || url}${state.title ? ` — "${state.title}"` : ''}`,
          problems.length ? `Console errors/warnings:\n${problems.join('\n')}` : 'No console errors.',
          `Visible text:\n${text.trim() || '(the page is empty)'}`
        ].join('\n\n')
        return { text: report, data: { kind: 'preview', url: state.url || url }, output: problems.length ? problems.join('\n') : undefined }
      }
    }
  }
}
