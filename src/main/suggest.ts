/**
 * suggest.ts — live suggestions while the user types or speaks.
 *
 * Fast and private: no model call. Suggestions come from simple intent
 * keywords plus an in-memory index of
 *   - file names in the APPROVED folders (two levels deep), and
 *   - installed app names.
 * The index is never written to disk and is refreshed at most once a minute.
 *
 * A suggestion either sends right away (send: true) or fills the message box
 * so the user can finish it (send: false, e.g. "Rename … to ").
 */
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join, sep } from 'node:path'
import type { Suggestion } from '@shared/ipc'
import { profileStore } from './store/profile'
import { listReminders } from './store/reminders'

const MAX_SUGGESTIONS = 4
const MAX_INDEXED_FILES = 3000
const FILE_TTL_MS = 60_000
const APP_TTL_MS = 5 * 60_000
const TEXT_TYPES = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.html', '.htm', '.xml', '.yaml', '.yml', '.rtf']

interface FileEntry {
  path: string
  name: string
  lower: string
  isDir: boolean
  mtime: number
}

let files: FileEntry[] = []
let filesAt = 0
let filesKey = ''
let apps: string[] = []
let appsAt = 0
let refreshing: Promise<void> | null = null

/** Show paths under the home folder as ~/... (shorter chips). */
const tildify = (p: string): string => (p.startsWith(homedir() + sep) ? `~${p.slice(homedir().length)}` : p)

async function scanFolder(root: string, depth: number, out: FileEntry[]): Promise<void> {
  if (out.length >= MAX_INDEXED_FILES) return
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (out.length >= MAX_INDEXED_FILES) return
    if (e.name.startsWith('.')) continue
    const path = join(root, e.name)
    const s = await stat(path).catch(() => null)
    if (!s) continue
    out.push({ path, name: e.name, lower: e.name.toLowerCase(), isDir: e.isDirectory(), mtime: s.mtimeMs })
    if (e.isDirectory() && depth > 1 && !e.name.endsWith('.app')) await scanFolder(path, depth - 1, out)
  }
}

async function scanApps(): Promise<string[]> {
  const names = new Set<string>()
  const add = async (dir: string, ext: string) => {
    for (const f of await readdir(dir).catch(() => [] as string[])) if (f.endsWith(ext)) names.add(f.slice(0, -ext.length))
  }
  if (process.platform === 'darwin') {
    for (const d of ['/Applications', '/System/Applications', '/System/Applications/Utilities', join(homedir(), 'Applications')]) await add(d, '.app')
  } else if (process.platform === 'win32') {
    const menus = [join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'), join(process.env.APPDATA ?? '', 'Microsoft\\Windows\\Start Menu\\Programs')]
    for (const d of menus) await add(d, '.lnk')
  } else {
    await add('/usr/share/applications', '.desktop')
  }
  return [...names].sort()
}

/** Refresh the index in the background when it is stale. */
function refreshIndex(): Promise<void> {
  const folders = profileStore.get().approvedFolders
  const key = folders.join('|')
  const now = Date.now()
  const filesStale = now - filesAt > FILE_TTL_MS || key !== filesKey
  const appsStale = now - appsAt > APP_TTL_MS
  if (!filesStale && !appsStale) return Promise.resolve()
  if (!refreshing) {
    refreshing = (async () => {
      if (filesStale) {
        const out: FileEntry[] = []
        for (const f of folders) if (existsSync(f)) await scanFolder(f, 2, out)
        files = out.sort((a, b) => b.mtime - a.mtime) // newest first
        filesAt = Date.now()
        filesKey = key
      }
      if (appsStale) {
        apps = await scanApps()
        appsAt = Date.now()
      }
    })().finally(() => (refreshing = null))
  }
  return refreshing
}

// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(
  'the a an to in of on for my me please can you could would and or with from about file files folder document doc this that it show list open summarize summarise read rename move delete remove organize organise tidy what whats is'.split(' ')
)

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}.]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
}

/** Files whose names contain the most keywords (ties: newest first). */
function matchFiles(words: string[], filter: (f: FileEntry) => boolean, limit = 3): FileEntry[] {
  if (!words.length) return []
  return files
    .filter(filter)
    .map((f) => ({ f, score: words.filter((w) => f.lower.includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.f.mtime - a.f.mtime)
    .slice(0, limit)
    .map((x) => x.f)
}

const isText = (f: FileEntry) => !f.isDir && TEXT_TYPES.includes(extname(f.name).toLowerCase())

/** Text after the intent word, e.g. "remind me to call mom" -> "call mom". */
const rest = (text: string, re: RegExp) => text.replace(re, '').trim().replace(/[?.!]+$/, '')

function forText(text: string): Suggestion[] {
  const low = text.toLowerCase()
  const words = keywords(text)
  const folders = profileStore.get().approvedFolders
  const out: Suggestion[] = []
  const add = (label: string, send = true, fill?: string) => out.push({ label, text: fill ?? label, send })

  if (/^(remind|set a reminder|reminder)/.test(low)) {
    const what = rest(text, /^(remind( me)?( to)?|set a reminder( to)?|reminder( to)?)\s*/i)
    if (what && !/\bin \d+|\bat \d|\bevery\b|tomorrow|tonight/i.test(what)) {
      add(`Remind me to ${what} in 10 minutes`)
      add(`Remind me to ${what} in 1 hour`)
      add(`Remind me to ${what} every day at 9am`)
    } else if (!what) add('Remind me to ', false)
  }

  if (/^(search|look up|google|find out|what is|what's|who is|news|latest|how much)/.test(low)) {
    const q = rest(text, /^(search( the web)?( for)?|look up|google|find out( about)?)\s*/i)
    if (q) add(`Search the web for ${q}`)
  }

  if (/^(remember|my name is|i like|i love|i prefer|i am|i'm|i work)/.test(low)) {
    const fact = rest(text, /^remember( that)?\s*/i)
    if (fact) add(`Remember that ${fact}`)
  }

  if (/^(open|launch|start)\b/.test(low)) {
    const name = rest(text, /^(open|launch|start)( the)?( app)?\s*/i).toLowerCase()
    for (const app of apps.filter((a) => !name || a.toLowerCase().includes(name)).slice(0, 3)) add(`Open ${app}`)
  }

  if (/^(sum|read|what's in|whats in|tl;?dr)/.test(low)) {
    for (const f of matchFiles(words, isText)) add(`Summarize ${tildify(f.path)}`)
    if (!words.length) for (const f of files.filter(isText).slice(0, 3)) add(`Summarize ${tildify(f.path)}`)
  }

  if (/^(organi[sz]e|tidy|clean)/.test(low)) {
    for (const f of folders.filter((f) => !words.length || words.some((w) => f.toLowerCase().includes(w)))) add(`Organize ${tildify(f)}`)
  }

  if (/^(list|show|what's in|whats in)/.test(low) && !/remind/.test(low)) {
    for (const f of matchFiles(words, (f) => f.isDir)) add(`List files in ${tildify(f.path)}`)
    for (const f of folders.filter((f) => !words.length || words.some((w) => f.toLowerCase().includes(w)))) add(`List files in ${tildify(f)}`)
  }

  if (/^rename\b/.test(low)) for (const f of matchFiles(words, (f) => !f.isDir)) add(`Rename ${tildify(f.path)}`, false, `Rename ${tildify(f.path)} to `)
  if (/^move\b/.test(low)) for (const f of matchFiles(words, () => true)) add(`Move ${tildify(f.path)}`, false, `Move ${tildify(f.path)} to `)
  if (/^(delete|remove|trash)\b/.test(low)) for (const f of matchFiles(words, (f) => !f.isDir)) add(`Delete ${tildify(f.path)}`, false)

  // No clear intent yet, but the words match a file: offer what you can do with it.
  if (out.length === 0) {
    for (const f of matchFiles(words, () => true, 2)) {
      if (f.isDir) add(`List files in ${tildify(f.path)}`)
      else if (isText(f)) add(`Summarize ${tildify(f.path)}`)
    }
  }
  return out
}

/** Suggestions for an empty message box, based on the time of day and your stuff. */
function forEmpty(): Suggestion[] {
  const out: Suggestion[] = []
  const hour = new Date().getHours()
  const folders = profileStore.get().approvedFolders
  if (hour >= 5 && hour < 12) out.push({ label: 'Plan my day', text: 'Help me plan my day', send: true })
  if (listReminders().length) out.push({ label: 'Show my reminders', text: 'List my reminders', send: true })
  const recentDoc = files.find(isText)
  if (recentDoc && Date.now() - recentDoc.mtime < 3 * 24 * 3600_000) {
    out.push({ label: `Summarize ${recentDoc.name}`, text: `Summarize ${tildify(recentDoc.path)}`, send: true })
  }
  if (folders[0]) out.push({ label: `What's in ${tildify(folders[0])}?`, text: `List files in ${tildify(folders[0])}`, send: true })
  out.push({ label: 'What can you do?', text: 'What can you do?', send: true })
  return out
}

export async function getSuggestions(input: unknown): Promise<Suggestion[]> {
  const text = typeof input === 'string' ? input.slice(0, 500).trim() : ''
  // First call waits for the index; later calls use it and refresh in the background.
  if (filesAt === 0) await refreshIndex()
  else void refreshIndex()

  const list = text ? forText(text) : forEmpty()
  const seen = new Set<string>()
  return list
    .filter((s) => s.text.toLowerCase() !== text.toLowerCase() && !seen.has(s.text) && seen.add(s.text))
    .slice(0, MAX_SUGGESTIONS)
}

/** Forget the index (e.g. after the folders change). */
export function resetSuggestIndex(): void {
  files = []
  filesAt = 0
  filesKey = ''
}
