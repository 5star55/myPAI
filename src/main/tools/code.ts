/**
 * code.ts — tools for working on code projects.
 *
 *   find_files   the files in a project (or those matching a pattern like *.tsx)
 *   search_code  find text in a project's files: "file:line: text"
 *   edit_file    replace an exact piece of a file (small, checkable changes)
 *
 * Folders like node_modules, .git and build output are skipped, and so are
 * .env files (secrets never go to the model). Paths go through checkPath().
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { checkPath } from '../security/allowlist'
import { inWorkspace } from '../store/workspaces'
import { needString, optBool, optString, outsideOf, type Tool } from './types'

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', '.cache', '.parcel-cache',
  'dist', 'build', 'out', 'coverage', 'target', '.venv', 'venv', '__pycache__', '.idea', '.vscode', '.expo'
])
const MAX_WALK = 5000
const MAX_FIND = 300
const MAX_MATCHES = 100
const MAX_SEARCH_BYTES = 512 * 1024
const MAX_EDIT_BYTES = 1024 * 1024

const isSecret = (name: string) => /^\.env(\..*)?$/i.test(name) && !/\.(example|sample|template)$/i.test(name)

/** Every file under `root` (relative paths, "/" separators), skipping dependency and build folders. */
async function walk(root: string): Promise<string[]> {
  const out: string[] = []
  const queue = [root]
  while (queue.length && out.length < MAX_WALK) {
    const dir = queue.shift()!
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !(e.name.startsWith('.') && e.name !== '.github')) queue.push(full)
      } else if (e.isFile() && !isSecret(e.name) && e.name !== '.DS_Store') {
        out.push(relative(root, full).split(sep).join('/'))
      }
    }
  }
  return out
}

/** "*.tsx", "src/**\/*.css", "page" -> a test for a relative path. Plain words match anywhere in the path. */
export function pathMatcher(pattern: string): (path: string) => boolean {
  if (!/[*?]/.test(pattern)) {
    const needle = pattern.toLowerCase()
    return (p) => p.toLowerCase().includes(needle)
  }
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\u0000')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\u0000/g, '(?:.*/)?')}$`,
    'i'
  )
  // A pattern without "/" matches the file name in any folder.
  return pattern.includes('/') ? (p) => re.test(p) : (p) => re.test(basename(p))
}

export const findFiles: Tool = {
  name: 'find_files',
  description:
    'List the files of a project folder and its subfolders (skips node_modules, .git, build output). Optional pattern: a glob like "*.tsx" or "src/**/*.css", or part of a name like "page". Use it first to learn a project.',
  permission: 'files_read',
  parameters: {
    type: 'object',
    properties: {
      folder: { type: 'string', description: 'Full path of the project folder' },
      pattern: { type: 'string', description: 'Optional glob or part of a file name' }
    },
    required: ['folder']
  },
  async prepare(args) {
    const check = checkPath(needString(args, 'folder'), { mustExist: true, isFolder: true })
    if (!check.ok) return { error: check.error }
    if (!(await stat(check.path)).isDirectory()) return { error: `"${check.path}" is not a folder.` }
    const pattern = optString(args, 'pattern')
    return {
      action: 'List the files in a project',
      autoApprove: inWorkspace(check.path),
      target: pattern ? `${check.path} (${pattern})` : check.path,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        const all = await walk(check.path)
        const files = pattern ? all.filter(pathMatcher(pattern)) : all
        if (!files.length) return `No files${pattern ? ` matching "${pattern}"` : ''} in ${check.path}.`
        const more = files.length > MAX_FIND ? `\n…and ${files.length - MAX_FIND} more (use a pattern to narrow it down).` : ''
        const list = files.slice(0, MAX_FIND).join('\n')
        return { text: `${files.length} file(s) in ${check.path}${pattern ? ` matching "${pattern}"` : ''}:\n${list}${more}`, output: list }
      }
    }
  }
}

export const searchCode: Tool = {
  name: 'search_code',
  description:
    'Search the text of every file in a project folder (skips node_modules, .git, build output). Returns "file:line: text" for each match. Use it to find where something is defined or used.',
  permission: 'files_read',
  parameters: {
    type: 'object',
    properties: {
      folder: { type: 'string', description: 'Full path of the project folder' },
      query: { type: 'string', description: 'Text to find (case-insensitive), or a regular expression if regex is true' },
      file_pattern: { type: 'string', description: 'Optional: only these files, e.g. "*.tsx"' },
      regex: { type: 'boolean', description: 'Treat query as a regular expression. Default false.' }
    },
    required: ['folder', 'query']
  },
  async prepare(args) {
    const check = checkPath(needString(args, 'folder'), { mustExist: true, isFolder: true })
    if (!check.ok) return { error: check.error }
    if (!(await stat(check.path)).isDirectory()) return { error: `"${check.path}" is not a folder.` }
    const query = needString(args, 'query', 500)
    let re: RegExp
    try {
      re = new RegExp(optBool(args, 'regex') ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    } catch {
      return { error: `"${query}" is not a valid regular expression.` }
    }
    const filePattern = optString(args, 'file_pattern')
    return {
      action: 'Search a project',
      autoApprove: inWorkspace(check.path),
      target: `“${query}” in ${check.path}`,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        const files = (await walk(check.path)).filter(filePattern ? pathMatcher(filePattern) : () => true)
        const hits: string[] = []
        let total = 0
        for (const rel of files) {
          const full = join(check.path, rel)
          const s = await stat(full).catch(() => null)
          if (!s || s.size > MAX_SEARCH_BYTES) continue
          const buf = await readFile(full).catch(() => null)
          if (!buf || buf.subarray(0, 8000).includes(0)) continue // binary
          buf
            .toString('utf8')
            .split('\n')
            .forEach((line, i) => {
              if (!re.test(line)) return
              total++
              if (hits.length < MAX_MATCHES) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 200)}`)
            })
        }
        if (!hits.length) return `No matches for “${query}” in ${check.path}.`
        const more = total > hits.length ? `\n…and ${total - hits.length} more matches.` : ''
        return { text: `${total} match(es) for “${query}” in ${check.path}:\n${hits.join('\n')}${more}`, output: hits.join('\n') }
      }
    }
  }
}

/** A short "- old / + new" view of an edit (for the dialog and the chat). */
function diffPreview(oldText: string, newText: string, max = 15): string {
  const side = (text: string, mark: string) => {
    const lines = text.split('\n')
    const shown = lines.slice(0, max).map((l) => `${mark} ${l}`)
    if (lines.length > max) shown.push(`${mark} …(${lines.length - max} more lines)`)
    return shown
  }
  return [...side(oldText, '-'), ...side(newText, '+')].join('\n')
}

export const editFile: Tool = {
  name: 'edit_file',
  description:
    'Change part of a text file: replaces old_text with new_text. Copy old_text EXACTLY from read_file (same spaces and line breaks) and include enough lines that it appears only once. Use create_file for new files.',
  permission: 'files_write',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Full path of the file' },
      old_text: { type: 'string', description: 'The exact text to replace (must appear once, unless replace_all)' },
      new_text: { type: 'string', description: 'The text to put in its place' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence. Default false.' }
    },
    required: ['path', 'old_text', 'new_text']
  },
  async prepare(args) {
    const check = checkPath(needString(args, 'path'), { mustExist: true })
    if (!check.ok) return { error: check.error }
    const s = await stat(check.path)
    if (!s.isFile()) return { error: `"${check.path}" is not a file.` }
    if (s.size > MAX_EDIT_BYTES) return { error: 'That file is too large to edit (max 1 MB).' }
    const oldText = typeof args.old_text === 'string' ? args.old_text : ''
    const newText = typeof args.new_text === 'string' ? args.new_text : ''
    if (!oldText) return { error: 'old_text is empty. Copy the exact text to replace from read_file.' }
    if (oldText === newText) return { error: 'old_text and new_text are the same, so nothing would change.' }
    const before = await readFile(check.path, 'utf8')
    const count = before.split(oldText).length - 1
    if (count === 0) {
      return { error: `old_text was not found in ${check.path}. Read the file again and copy the text exactly (spaces and line breaks too).` }
    }
    const all = optBool(args, 'replace_all')
    if (count > 1 && !all) {
      return { error: `old_text appears ${count} times in ${check.path}. Include more surrounding lines so it is unique, or set replace_all.` }
    }
    const at = before.indexOf(oldText)
    const line = before.slice(0, at).split('\n').length
    const diff = diffPreview(oldText, newText)
    return {
      action: 'Edit a file',
      autoApprove: inWorkspace(check.path), // a project pai created: part of the job
      target: check.path,
      preview: diff,
      folder: check.folder ?? undefined,
      outsideFolders: outsideOf(check),
      run: async () => {
        // The file must not have changed since the dialog showed the edit.
        if ((await readFile(check.path, 'utf8')) !== before) throw new Error('The file changed in the meantime. Read it again and redo the edit.')
        const after = all ? before.split(oldText).join(newText) : before.slice(0, at) + newText + before.slice(at + oldText.length)
        await writeFile(check.path, after, 'utf8')
        const where = all ? `${count} places` : `line ${line}`
        return { text: `Edited ${check.path} (${where}).`, output: diff }
      }
    }
  }
}
