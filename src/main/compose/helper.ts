/**
 * helper.ts — talks to the native text helper, which reads the focused text box
 * in another app and inserts text into it:
 *   macOS    native/bin/pai-axhelper        (native/axhelper/main.swift, Accessibility API)
 *   Windows  native/bin/pai-winhelper.exe   (native/winhelper/program.cs, UI Automation)
 *
 * Started on first use and kept running; one JSON line per request. It gets a
 * bare environment (no API keys).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { app } from 'electron'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** The focused text box, as the helper sees it. */
export interface FieldInfo {
  ok: boolean
  /** not-trusted | no-app | no-focus | no-text | secure | helper-missing | helper-failed */
  error?: string
  /** On macOS bundleId is the bundle id; on Windows it is the lowercase program name ("notepad.exe"). */
  app?: { name: string; bundleId: string; pid: number }
  role?: string
  /** Text before the caret (up to 2000 characters) and after the selection (up to 400). */
  before?: string
  after?: string
  selected?: boolean
  caret?: Rect
  frame?: Rect
}

export interface HelperReply {
  ok: boolean
  error?: string
  trusted?: boolean
  method?: 'ax' | 'keys'
}

/** In the installed app the helper is unpacked next to the app archive (programs can't run from inside it). */
export const helperPath = (): string =>
  join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), process.platform === 'win32' ? 'native/bin/pai-winhelper.exe' : 'native/bin/pai-axhelper')

export const helperAvailable = (): boolean =>
  (process.platform === 'darwin' || process.platform === 'win32') && existsSync(helperPath())

/** Only what Windows and .NET need to start a program. Nothing else (no API keys) is passed on. */
const WIN_ENV = [
  'SystemRoot', 'windir', 'SystemDrive', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'ProgramData', 'ALLUSERSPROFILE', 'COMSPEC',
  'DOTNET_ROOT', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME', 'PROCESSOR_ARCHITECTURE', 'OS'
]

function helperEnv(): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return { PATH: '/usr/bin:/bin' }
  const env: NodeJS.ProcessEnv = {}
  for (const k of WIN_ENV) {
    const v = process.env[k]
    if (v !== undefined) env[k] = v
  }
  return env
}

let proc: ChildProcessWithoutNullStreams | null = null
let nextId = 1
const pending = new Map<number, (reply: Record<string, unknown>) => void>()

function failAll(error: string): void {
  for (const resolve of pending.values()) resolve({ ok: false, error })
  pending.clear()
}

function ensure(): ChildProcessWithoutNullStreams | null {
  if (proc && proc.exitCode === null) return proc
  if (!helperAvailable()) return null
  const child = spawn(helperPath(), [], { stdio: ['pipe', 'pipe', 'pipe'], env: helperEnv(), windowsHide: true })
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    const resolve = pending.get(Number(msg.id))
    if (resolve) {
      pending.delete(Number(msg.id))
      resolve(msg)
    }
  })
  child.stderr.on('data', (d) => console.warn(`[compose] helper: ${String(d).trim()}`))
  child.on('exit', () => {
    if (proc === child) proc = null
    failAll('helper-failed')
  })
  child.on('error', (err) => {
    console.error('[compose] helper failed to start:', err)
    failAll('helper-failed')
  })
  proc = child
  return child
}

function request<T>(cmd: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const child = ensure()
  if (!child) return Promise.resolve({ ok: false, error: 'helper-missing' } as T)
  const id = nextId++
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ ok: false, error: 'helper-timeout' } as T)
    }, timeoutMs)
    pending.set(id, (reply) => {
      clearTimeout(timer)
      resolve(reply as T)
    })
    child.stdin.write(`${JSON.stringify({ ...cmd, id })}\n`)
  })
}

/** Read the focused text box in the frontmost app. */
export const readField = (): Promise<FieldInfo> => request<FieldInfo>({ cmd: 'read' }, 4000)

/** Insert text at the caret of the box from the last readField(). */
export const insertText = (text: string): Promise<HelperReply> => request<HelperReply>({ cmd: 'insert', text }, 15000)

/** Has the Accessibility permission been granted? prompt=true shows macOS's own prompt. */
export async function isTrusted(prompt = false): Promise<boolean> {
  const r = await request<HelperReply>({ cmd: 'trusted', prompt }, 3000)
  return r.ok && r.trusted === true
}

export function stopHelper(): void {
  proc?.kill()
  proc = null
}