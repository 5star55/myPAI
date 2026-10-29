/**
 * files.ts — file tools. Every path goes through checkPath() (the allowlist).
 * Nothing is ever permanently deleted: deletes and overwrites go to the Trash.
 */
import { existsSync } from 'node:fs'
import { mkdir, open, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { shell } from 'electron'
import { checkPath, isInside, realPath } from '../security/allowlist'
import { addWorkspace, inWorkspace } from '../store/workspaces'
import { ToolInputError, needString, optBool, outsideOf, type Tool } from './types'

const MAX_LIST = 200

/** Every path is inside a folder pai created itself (see store/workspaces.ts). */
const ownWork = (...paths: string[]): boolean => paths.every(inWorkspace)

/** The topmost folder that `mkdir -p folder` would create, or null if it already exists. */
function firstMissingFolder(folder: string): string | null {
  let missing: string | null = null
  for (let p = folder; !existsSync(p) && dirname(p) !== p; p = dirname(p)) missing = p
  return missing
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** A new file name must be a plain name: no folders, no tricks. */
function validName(name: string): string {
  if (/[/\\:\0]/.test(name) || name === '.' || name === '..' || name.length > 255) {
    throw new ToolInputError(`"${name}" is not a valid file name.`)
  }
  return name
}

export const listFiles: Tool = {
  name: 'list_files',
  description: 'List the files and folders inside a folder. Use a full path such as ~/Downloads.',
  permission: 'files_read',
  parameters: {
    type: 'object',
    properties: { folder: { type: 'string', description: 'Full path of the folder, e.g. ~/Downloads' } },
    required: ['folder']
  },
  async prepare(args) {
    const check = checkPath(needString(args, 'folder'), { mustExist: true, isFolder: true })
    if (!check.ok) return { error: check.error }
    if (!(await stat(check.path)).isDirectory()) return { error: `"${check.path}" is not a folder.` }
    return {
      action: 'List the files in a folder',
      autoApprove: ownWork(check.path), // looking around a project pai created never asks
      target: check.path,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        const entries = await readdir(check.path, { withFileTypes: true })
        const visible = entries.filter((e) => !e.name.startsWith('.'))
        const lines: string[] = []
        for (const e of visible.slice(0, MAX_LIST)) {
          if (e.isDirectory()) {
            lines.push(`[folder] ${e.name}/`)
          } else {
            const s = await stat(join(check.path, e.name)).catch(() => null)
            lines.push(s ? `${e.name}  (${formatSize(s.size)}, modified ${s.mtime.toISOString().slice(0, 10)})` : e.name)
          }
        }
        const more = visible.length > MAX_LIST ? `\n…and ${visible.length - MAX_LIST} more.` : ''
        const hidden = entries.length - visible.length
        return `${check.path} contains ${visible.length} item(s)${hidden ? ` (+${hidden} hidden)` : ''}:\n${lines.join('\n')}${more}`
      }
    }
  }
}

export const moveFile: Tool = {
  name: 'move_file',
  description: 'Move a file or folder into another folder (both inside approved folders). Creates the destination folder if needed.',
  permission: 'files_write',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Full path of the file to move' },
      destination_folder: { type: 'string', description: 'Full path of the folder to move it into' },
      overwrite: { type: 'boolean', description: 'Replace a file with the same name (old one goes to Trash). Default false.' }
    },
    required: ['source', 'destination_folder']
  },
  prepare(args) {
    const src = checkPath(needString(args, 'source'), { mustExist: true })
    if (!src.ok) return { error: src.error }
    const dest = checkPath(needString(args, 'destination_folder'), { isFolder: true })
    if (!dest.ok) return { error: dest.error }
    if (src.path === src.folder) return { error: 'An approved folder itself cannot be moved.' }
    if (isInside(realPath(dest.path), realPath(src.path))) return { error: 'A folder cannot be moved into itself.' }

    const target = join(dest.path, basename(src.path))
    if (target === src.path) return { error: 'The file is already in that folder.' }
    const overwrite = optBool(args, 'overwrite')
    const exists = existsSync(target)
    if (exists && !overwrite) return { error: `"${target}" already exists. Ask the user if it should be overwritten.` }

    return {
      action: exists ? 'Move a file and OVERWRITE the existing one (old one goes to Trash)' : 'Move a file',
      target: `${src.path}  →  ${target}`,
      destructive: exists,
      alsoNeeds: exists && !ownWork(src.path, target) ? ['files_delete'] : undefined,
      autoApprove: ownWork(src.path, target),
      folder: src.folder ?? undefined,
      outsideFolders: outsideOf(src, dest),
      run: async () => {
        await mkdir(dest.path, { recursive: true })
        if (exists) await shell.trashItem(target)
        await rename(src.path, target)
        return `Moved ${src.path} to ${target}.`
      }
    }
  }
}

export const renameFile: Tool = {
  name: 'rename_file',
  description: 'Rename a file or folder in place (it stays in the same folder).',
  permission: 'files_write',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Full path of the file to rename' },
      new_name: { type: 'string', description: 'New file name only, e.g. "report-2026.pdf" (no folders)' },
      overwrite: { type: 'boolean', description: 'Replace a file that already has that name (old one goes to Trash). Default false.' }
    },
    required: ['path', 'new_name']
  },
  prepare(args) {
    const src = checkPath(needString(args, 'path'), { mustExist: true })
    if (!src.ok) return { error: src.error }
    if (src.path === src.folder) return { error: 'An approved folder itself cannot be renamed.' }
    const target = join(dirname(src.path), validName(needString(args, 'new_name', 255)))
    if (target === src.path) return { error: 'That is already the name.' }
    const overwrite = optBool(args, 'overwrite')
    // Case-only renames (a.txt -> A.txt) "exist" on case-insensitive disks (macOS/Windows) but are safe.
    const caseOnly = process.platform !== 'linux' && target.toLowerCase() === src.path.toLowerCase()
    const exists = existsSync(target) && !caseOnly
    if (exists && !overwrite) return { error: `"${target}" already exists. Ask the user if it should be overwritten.` }

    return {
      action: exists ? 'Rename a file and OVERWRITE the existing one (old one goes to Trash)' : 'Rename a file',
      target: `${src.path}  →  ${basename(target)}`,
      destructive: exists,
      alsoNeeds: exists && !ownWork(src.path) ? ['files_delete'] : undefined,
      autoApprove: ownWork(src.path),
      folder: src.folder ?? undefined,
      outsideFolders: outsideOf(src),
      run: async () => {
        if (exists) await shell.trashItem(target)
        await rename(src.path, target)
        return `Renamed ${basename(src.path)} to ${basename(target)}.`
      }
    }
  }
}

export const deleteFile: Tool = {
  name: 'delete_file',
  description: 'Move a file or folder to the Trash / Recycle Bin.',
  permission: 'files_delete',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Full path of the file to delete' } },
    required: ['path']
  },
  prepare(args) {
    const check = checkPath(needString(args, 'path'), { mustExist: true })
    if (!check.ok) return { error: check.error }
    if (check.path === check.folder) return { error: 'An approved folder itself cannot be deleted.' }
    return {
      action: 'DELETE a file (move it to the Trash)',
      target: check.path,
      destructive: true,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        await shell.trashItem(check.path)
        return `Moved ${check.path} to the Trash.`
      }
    }
  }
}

/** File type -> subfolder used by organize_folder. */
const CATEGORIES: Record<string, string[]> = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.svg', '.bmp', '.tiff'],
  Documents: ['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.odt', '.pages', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.key', '.numbers'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2'],
  Audio: ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg'],
  Video: ['.mp4', '.mov', '.mkv', '.avi', '.webm'],
  Installers: ['.dmg', '.pkg', '.exe', '.msi', '.deb', '.appimage'],
  Code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json', '.ipynb']
}
const PARTIAL_DOWNLOAD = ['.crdownload', '.part', '.download', '.tmp']

export function categoryFor(file: string): string | null {
  const ext = extname(file).toLowerCase()
  for (const [cat, exts] of Object.entries(CATEGORIES)) if (exts.includes(ext)) return cat
  return null
}

export const organizeFolder: Tool = {
  name: 'organize_folder',
  description: 'Tidy a folder by moving its loose files into subfolders by type (Images, Documents, Archives, Audio, Video, Installers, Code). Never overwrites.',
  permission: 'files_write',
  parameters: {
    type: 'object',
    properties: { folder: { type: 'string', description: 'Full path of the folder to organize' } },
    required: ['folder']
  },
  async prepare(args) {
    const check = checkPath(needString(args, 'folder'), { mustExist: true, isFolder: true })
    if (!check.ok) return { error: check.error }
    if (!(await stat(check.path)).isDirectory()) return { error: `"${check.path}" is not a folder.` }

    const entries = await readdir(check.path, { withFileTypes: true })
    const plan: { from: string; to: string }[] = []
    for (const e of entries) {
      if (!e.isFile() || e.name.startsWith('.')) continue
      if (PARTIAL_DOWNLOAD.includes(extname(e.name).toLowerCase())) continue
      const cat = categoryFor(e.name)
      if (cat) plan.push({ from: join(check.path, e.name), to: join(check.path, cat, e.name) })
    }
    if (plan.length === 0) return { error: `Nothing to organize in ${check.path}.` }
    const cats = [...new Set(plan.map((p) => basename(dirname(p.to))))]

    return {
      action: `Organize ${plan.length} file(s) into subfolders: ${cats.join(', ')}`,
      target: check.path,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        let moved = 0
        const skipped: string[] = []
        for (const { from, to } of plan) {
          if (existsSync(to)) {
            skipped.push(basename(from))
            continue
          }
          await mkdir(dirname(to), { recursive: true })
          await rename(from, to)
          moved++
        }
        return `Moved ${moved} file(s) into ${cats.join(', ')}.${skipped.length ? ` Skipped (name already taken): ${skipped.join(', ')}.` : ''}`
      }
    }
  }
}

const MAX_WRITE_CHARS = 1_000_000
const MAX_READ_BYTES = 200_000

/** First lines of a text, for the preview under the step. */
const firstLines = (text: string, n = 20) => text.split('\n').slice(0, n).join('\n')

export const createFile: Tool = {
  name: 'create_file',
  description: 'Create a text file (e.g. notes, a script, a list) with the given content. Fails if the file exists unless overwrite is true.',
  permission: 'files_write',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Full path of the new file, e.g. ~/Documents/notes.txt' },
      content: { type: 'string', description: 'The full text to write into the file' },
      overwrite: { type: 'boolean', description: 'Replace an existing file (old one goes to Trash). Default false.' }
    },
    required: ['path', 'content']
  },
  async prepare(args) {
    const check = checkPath(needString(args, 'path'))
    if (!check.ok) return { error: check.error }
    const content = typeof args.content === 'string' ? args.content : ''
    if (content.length > MAX_WRITE_CHARS) return { error: 'That content is too large (max 1 MB).' }
    validName(basename(check.path))
    const exists = existsSync(check.path)
    if (exists && (await stat(check.path)).isDirectory()) return { error: `"${check.path}" is a folder.` }
    const overwrite = optBool(args, 'overwrite')
    if (exists && !overwrite) return { error: `"${check.path}" already exists. Ask the user if it should be replaced.` }
    const lines = content ? content.split('\n').length : 0
    return {
      action: exists ? 'REPLACE a file (old one goes to Trash)' : 'Create a file',
      // In a project pai created, writing its files is part of the job (old versions still go to the Trash).
      autoApprove: ownWork(check.path),
      target: check.path,
      preview: firstLines(content, 12) || '(empty file)',
      destructive: exists,
      alsoNeeds: exists && !ownWork(check.path) ? ['files_delete'] : undefined,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        const made = firstMissingFolder(dirname(check.path))
        await mkdir(dirname(check.path), { recursive: true })
        if (made) addWorkspace(made) // a new folder for this file: pai's own work from now on
        if (exists) await shell.trashItem(check.path)
        await writeFile(check.path, content, 'utf8')
        return { text: `Created ${check.path} (${lines} line${lines === 1 ? '' : 's'}).`, output: firstLines(content) }
      }
    }
  }
}

export const createFolder: Tool = {
  name: 'create_folder',
  description: 'Create a new folder (and any missing parent folders).',
  permission: 'files_write',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Full path of the folder to create' } },
    required: ['path']
  },
  prepare(args) {
    const check = checkPath(needString(args, 'path'), { isFolder: true })
    if (!check.ok) return { error: check.error }
    if (existsSync(check.path)) return { error: `"${check.path}" already exists.` }
    return {
      action: 'Create a folder',
      autoApprove: ownWork(check.path),
      target: check.path,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        const made = firstMissingFolder(check.path)
        await mkdir(check.path, { recursive: true })
        if (made) addWorkspace(made)
        return `Created folder ${check.path}.`
      }
    }
  }
}

export const readFile: Tool = {
  name: 'read_file',
  description:
    'Read the text of a file (up to 200 KB). Use this to look inside a file before changing or explaining it. For a long file, read part of it with start_line and line_count.',
  permission: 'documents',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Full path of the file' },
      start_line: { type: 'number', description: 'Optional: first line to read (1 = the start)' },
      line_count: { type: 'number', description: 'Optional: how many lines to read from start_line' }
    },
    required: ['path']
  },
  async prepare(args) {
    const check = checkPath(needString(args, 'path'), { mustExist: true })
    if (!check.ok) return { error: check.error }
    const s = await stat(check.path)
    if (!s.isFile()) return { error: `"${check.path}" is not a file.` }
    return {
      action: 'Read a file',
      autoApprove: ownWork(check.path),
      target: check.path,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        const buf = await readFileBytes(check.path)
        if (buf.includes(0)) throw new Error('That looks like a binary file, not text.')
        const text = buf.toString('utf8')
        const start = Math.max(1, Math.floor(Number(args.start_line) || 1))
        const count = Math.floor(Number(args.line_count) || 0)
        if (start > 1 || count > 0) {
          const lines = text.split('\n')
          const part = lines.slice(start - 1, count > 0 ? start - 1 + count : undefined)
          const end = start + part.length - 1
          return { text: `Lines ${start}-${end} of ${lines.length} in ${check.path}:\n${part.join('\n')}`, output: firstLines(part.join('\n')) }
        }
        const more = s.size > MAX_READ_BYTES ? `\n…(file is ${formatSize(s.size)}; showing the first ${formatSize(MAX_READ_BYTES)})` : ''
        const lineCount = text.split('\n').length
        return { text: `Contents of ${check.path} (${lineCount} lines):\n${text}${more}`, output: firstLines(text) }
      }
    }
  }
}

async function readFileBytes(path: string): Promise<Buffer> {
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(MAX_READ_BYTES)
    const { bytesRead } = await fh.read(buf, 0, MAX_READ_BYTES, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await fh.close()
  }
}
