/**
 * files.ts — file tools. Every path goes through checkPath() (the allowlist).
 * Nothing is ever permanently deleted: deletes and overwrites go to the Trash.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { shell } from 'electron'
import { checkPath, isInside, realPath } from '../security/allowlist'
import { ToolInputError, needString, optBool, outsideOf, type Tool } from './types'

const MAX_LIST = 200

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
      alsoNeeds: exists ? ['files_delete'] : undefined,
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
      alsoNeeds: exists ? ['files_delete'] : undefined,
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
