/**
 * allowlist.ts — which paths the assistant may touch. Enforced in code.
 *
 * Every file tool calls checkPath() BEFORE asking permission. After resolving
 * "~", "..", and symlinks, a path is one of:
 *
 *   inside   — in an approved folder: the normal permission dialog.
 *   anywhere — with "Allow all folders" on (the default): any other folder, with the
 *              normal permission dialog too. "Always allow" then covers the top folder
 *              under home (e.g. ~/Projects), never home or a whole drive.
 *   outside  — with it off: anywhere else is allowed ONLY after a special dialog that
 *              warns "outside your approved folders". Never remembered automatically.
 *   protected — never allowed, not even with permission: system folders,
 *              key/credential folders, and pai's own data and code (so the
 *              assistant can never edit its own approvals or settings).
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, parse, relative, sep } from 'node:path'
import { app } from 'electron'
import { dataDir } from '../paths'
import { normalizeFolder, profileStore } from '../store/profile'

export type PathCheck =
  | {
      ok: true
      /** Real path (symlinks resolved). */
      path: string
      /** The approved folder containing it, or null when outside. */
      folder: string | null
      /** When outside: the folder the user could approve (the path's parent, or itself for folders). */
      outsideFolder: string | null
    }
  | { ok: false; error: string }

// macOS and Windows file systems are usually case-insensitive.
const caseInsensitive = process.platform === 'darwin' || process.platform === 'win32'
const norm = (p: string): string => (caseInsensitive ? p.toLowerCase() : p)

/**
 * Resolve symlinks. For a path that does not exist yet (e.g. a rename target),
 * resolve its nearest existing parent and re-attach the rest.
 */
export function realPath(p: string): string {
  let current = p
  const rest: string[] = []
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    rest.unshift(basename(current))
    current = parent
  }
  let real = current
  try {
    real = realpathSync.native(current)
  } catch {
    /* keep as is */
  }
  return rest.length ? join(real, ...rest) : real
}

export function isInside(child: string, folder: string): boolean {
  const rel = relative(norm(folder), norm(child))
  return rel === '' || (rel.split(sep)[0] !== '..' && !isAbsolute(rel))
}

/** Places that are never touched, whatever the user or model says. */
function protectedRoots(): string[] {
  const home = homedir()
  const common = [
    dataDir(), // pai's own profile, approvals, memory, log
    app.getAppPath(), // pai's code and .env (API keys)
    join(home, '.ssh'),
    join(home, '.gnupg'),
    join(home, '.aws'),
    join(home, '.kube'),
    join(home, '.docker')
  ]
  const system =
    process.platform === 'darwin'
      ? ['/System', '/usr', '/bin', '/sbin', '/etc', '/private/etc', '/private/var/db', '/Library', join(home, 'Library/Keychains')]
      : process.platform === 'win32'
        ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData']
        : ['/etc', '/usr', '/bin', '/sbin', '/boot', '/proc', '/sys', '/dev', '/var', '/root']
  return [...common, ...system].map(realPath)
}

/** True if the path is (inside) a protected place, or is the disk root. */
export function isProtected(real: string): boolean {
  if (dirname(real) === real) return true // "/" or "C:\"
  return protectedRoots().some((root) => isInside(real, root))
}

/** The approved folder that contains `p`, or null. */
export function approvedFolderFor(p: string): string | null {
  const real = realPath(p)
  for (const folder of profileStore.get().approvedFolders) {
    if (isInside(real, realPath(folder))) return folder
  }
  return null
}

/**
 * "Allow all folders": the folder an "always allow" covers. The top folder under home
 * (~/Projects for ~/Projects/site/a.ts), or the first two levels elsewhere (/Volumes/Drive).
 * null for files directly in home or at a drive's top level: nothing that broad is remembered.
 */
export function scopeFor(path: string, isFolder = false): string | null {
  const home = realPath(homedir())
  if (isInside(path, home) && path.length > home.length) {
    const rel = relative(home, path)
    const parts = rel.split(sep)
    return parts.length > 1 || isFolder ? join(home, parts[0]) : null
  }
  const { root } = parse(path)
  const parts = path.slice(root.length).split(sep).filter(Boolean)
  return parts.length > 2 || (isFolder && parts.length === 2) ? join(root, parts[0], parts[1]) : null
}

/**
 * Models often write paths the way a shell wants them: "quoted", or with "\ " for a space
 * (~/Desktop/brand\ images). The file tools take plain paths, so undo that.
 */
export function cleanPathInput(input: string): string {
  let p = input.trim()
  if (/^(["']).*\1$/.test(p)) p = p.slice(1, -1)
  p = p.replace(/(["'])([^"']*)\1/g, '$2') // ~/Desktop/"brand images"/a.png
  if (process.platform !== 'win32') p = p.replace(/\\(.)/g, '$1') // on Windows "\" separates folders
  return p.length > 1 ? p.replace(/[/\\]+$/, '') : p
}

const nameKey = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/**
 * "…does not exist", plus what IS there: the closest names next to it (brand-images →
 * "brand images"), or the folder's contents, so the model stops guessing.
 */
function notFound(path: string): string {
  let dir = dirname(path)
  let wanted = basename(path)
  while (!existsSync(dir) && dirname(dir) !== dir) {
    wanted = basename(dir)
    dir = dirname(dir)
  }
  let names: string[] = []
  try {
    names = isProtected(dir) ? [] : readdirSync(dir).filter((n) => !n.startsWith('.'))
  } catch {
    /* unreadable: no hint */
  }
  const want = nameKey(wanted)
  const close = names.filter((n) => {
    const k = nameKey(n)
    return k === want || (want.length > 2 && k.length > 2 && (k.includes(want) || want.includes(k)))
  })
  if (close.length) return `"${path}" does not exist. Did you mean: ${close.slice(0, 5).map((n) => join(dir, n)).join(' | ')} ?`
  if (!names.length) return `"${path}" does not exist.`
  const more = names.length > 30 ? ` …and ${names.length - 30} more` : ''
  return `"${path}" does not exist. ${dir} contains: ${names.slice(0, 30).join(' | ')}${more}`
}

/** Validate a path coming from the model. */
export function checkPath(input: unknown, opts: { mustExist?: boolean; isFolder?: boolean } = {}): PathCheck {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'No path was given.' }
  const raw = cleanPathInput(input)
  if (raw.includes('\0')) return { ok: false, error: 'Invalid path.' }
  if (!isAbsolute(raw) && !raw.startsWith('~')) {
    return { ok: false, error: `"${raw}" is not a full path. Use a full path like ~/Downloads/file.txt.` }
  }
  const path = realPath(normalizeFolder(raw))
  if (isProtected(path)) {
    return { ok: false, error: `"${path}" is a protected location (system, keys, or pai's own files). pai never touches it.` }
  }
  if (opts.mustExist && !existsSync(path)) return { ok: false, error: notFound(path) }

  const folder = approvedFolderFor(path)
  if (folder) return { ok: true, path, folder, outsideFolder: null }
  if (profileStore.get().folderAccess === 'all') return { ok: true, path, folder: scopeFor(path, opts.isFolder), outsideFolder: null }
  return { ok: true, path, folder: null, outsideFolder: opts.isFolder ? path : dirname(path) }
}
