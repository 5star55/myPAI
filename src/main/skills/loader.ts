/**
 * loader.ts — skills are plain files.
 *
 * Two places:
 *   built-in  skills/ in the app folder (read-only)
 *   yours     <data folder>/skills/ (uploaded or created in the app; editable)
 *
 * Markdown (.md) with a small header:
 *   ---
 *   name: File Organizer
 *   description: Keeps folders tidy
 *   permissions: files_read, files_write
 *   triggers: tidy, organize, clean up      (optional)
 *   ---
 *   Instructions for the assistant go here...
 *
 * or JSON (.json): { "name", "description", "instructions", "permissions": [] }
 *
 * A skill is active only if it is enabled in the profile AND every permission
 * it needs is switched on. A skill with triggers is only added to the prompt when
 * the user's recent messages contain one of them (so a quiz skill doesn't turn every
 * question into a quiz). Skills are instructions only: they can never grant
 * permissions, and every action still goes through the permission dialog.
 *
 * Uploading is two steps: previewImport() reads and validates the files and
 * keeps them in memory; installImport() writes only what the user confirmed.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { shell } from 'electron'
import { PERMISSION_KEYS, type PermissionKey, type Profile, type SkillDetail, type SkillDraft, type SkillImport, type SkillInfo } from '@shared/ipc'
import { dataFile, skillsDir } from '../paths'

interface Skill extends Omit<SkillInfo, 'enabled' | 'missing'> {
  instructions: string
  path: string
  /** Words or phrases that switch the skill on for a message (none = always on). */
  triggers?: string[]
}

export const MAX_SKILL_BYTES = 64 * 1024
const MAX_INSTRUCTIONS = 4000
/** Ids of your own skills start with this, so they never clash with built-ins. */
const USER_PREFIX = 'my-'

let skills: Skill[] = []

export const userSkillsDir = (): string => dataFile('skills')

// ---------------------------------------------------------------------------
// Parsing (shared by built-in files, uploads and the editor)
// ---------------------------------------------------------------------------

function parsePermissions(raw: unknown): PermissionKey[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const out: PermissionKey[] = []
  for (const p of list.map((x) => String(x).trim()).filter(Boolean)) {
    if (!PERMISSION_KEYS.includes(p as PermissionKey)) throw new Error(`unknown permission "${p}"`)
    if (!out.includes(p as PermissionKey)) out.push(p as PermissionKey)
  }
  return out
}

function parseMarkdown(text: string): Record<string, string> {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) throw new Error('missing the --- header block at the top')
  const fields: Record<string, string> = { instructions: m[2].trim() }
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*)$/)
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim()
  }
  return fields
}

/** Validate skill text. Throws a readable error if it isn't a valid skill. */
export function parseSkill(
  text: string,
  ext: string
): { name: string; description: string; permissions: PermissionKey[]; instructions: string; triggers?: string[] } {
  if (text.length > MAX_SKILL_BYTES) throw new Error('the file is larger than 64 KB')
  let raw: Record<string, unknown>
  if (ext === '.json') {
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('it is not valid JSON')
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('it is not a JSON object')
  } else raw = parseMarkdown(text)
  const name = String(raw.name ?? '').trim()
  const instructions = String(raw.instructions ?? '').trim()
  if (!name) throw new Error('it has no name')
  if (!instructions) throw new Error('it has no instructions')
  if (instructions.length > MAX_INSTRUCTIONS) throw new Error(`the instructions are longer than ${MAX_INSTRUCTIONS} characters`)
  return {
    name: name.slice(0, 60),
    description: String(raw.description ?? '').trim().slice(0, 200),
    permissions: parsePermissions(raw.permissions),
    instructions,
    ...(parseTriggers(raw.triggers).length ? { triggers: parseTriggers(raw.triggers) } : {})
  }
}

function parseTriggers(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  return list.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 40)
}

/** Does the text mention one of the triggers (as whole words; "quiz" also matches "quizzes")? */
function mentions(text: string, triggers: string[]): boolean {
  const lower = text.toLowerCase()
  return triggers.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(lower))
}

/** The .md file the editor writes. */
export function toMarkdown(s: { name: string; description: string; permissions: PermissionKey[]; instructions: string }): string {
  const oneLine = (t: string) => t.replace(/[\r\n]+/g, ' ').trim()
  return `---\nname: ${oneLine(s.name)}\ndescription: ${oneLine(s.description)}\npermissions: ${s.permissions.join(', ')}\n---\n${s.instructions.trim()}\n`
}

/** "Study Buddy!" -> "my-study-buddy" */
function userIdFor(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
  return `${USER_PREFIX}${slug || 'skill'}`
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function loadFile(path: string, source: 'builtin' | 'user'): Skill {
  const file = basename(path)
  const stem = basename(path, extname(path))
  const id = source === 'user' ? (stem.startsWith(USER_PREFIX) ? stem : `${USER_PREFIX}${stem}`) : stem
  const base = { id, file, source, name: stem, description: '', permissions: [] as PermissionKey[], instructions: '', path }
  try {
    return { ...base, ...parseSkill(readFileSync(path, 'utf8'), extname(path).toLowerCase()) }
  } catch (err) {
    return { ...base, error: `Could not load: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function readDir(dir: string, source: 'builtin' | 'user'): Skill[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => ['.md', '.json'].includes(extname(f).toLowerCase()))
    .sort()
    .map((f) => loadFile(join(dir, f), source))
}

/** (Re)load all skills from disk. Called at startup and after any change. */
export function loadSkills(): void {
  skills = [...readDir(skillsDir(), 'builtin'), ...readDir(userSkillsDir(), 'user')]
  console.log(`[skills] loaded ${skills.length} skill(s)`)
}

export function listSkills(profile: Profile): SkillInfo[] {
  return skills.map(({ instructions: _i, path: _p, ...s }) => ({
    ...s,
    enabled: profile.enabledSkills.includes(s.id),
    missing: s.permissions.filter((p) => !profile.permissions[p])
  }))
}

/** Skills that will be added to the system prompt. */
export function activeSkills(profile: Profile, recentText?: string): Skill[] {
  return skills.filter(
    (s) =>
      !s.error &&
      profile.enabledSkills.includes(s.id) &&
      s.permissions.every((p) => profile.permissions[p]) &&
      (!s.triggers?.length || recentText === undefined || mentions(recentText, s.triggers))
  )
}

export function getSkill(id: unknown): SkillDetail {
  const s = skills.find((x) => x.id === id)
  if (!s) throw new Error('That skill no longer exists.')
  return { id: s.id, source: s.source, name: s.name, description: s.description, permissions: s.permissions, instructions: s.instructions }
}

// ---------------------------------------------------------------------------
// Uploading: preview first, install only what the user confirms
// ---------------------------------------------------------------------------

const pending = new Map<string, { id: string; text: string; ext: string; expires: number }>()
const PENDING_MS = 10 * 60_000

export function previewImport(paths: unknown): SkillImport[] {
  if (!Array.isArray(paths)) return []
  const now = Date.now()
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k)

  return paths.slice(0, 20).map((p): SkillImport => {
    const file = typeof p === 'string' ? basename(p) : '?'
    const fail = (error: string): SkillImport => ({ token: '', file, name: file, description: '', permissions: [], instructions: '', error })
    if (typeof p !== 'string') return fail('Not a file.')
    const ext = extname(p).toLowerCase()
    if (ext !== '.md' && ext !== '.json') return fail('Skills must be .md or .json files.')
    try {
      const st = statSync(p)
      if (!st.isFile()) return fail('Not a file.')
      if (st.size > MAX_SKILL_BYTES) return fail('The file is larger than 64 KB.')
      const text = readFileSync(p, 'utf8')
      const parsed = parseSkill(text, ext)
      const id = userIdFor(parsed.name)
      const token = randomUUID()
      pending.set(token, { id, text, ext, expires: now + PENDING_MS })
      return { token, file, ...parsed, replaces: skills.some((s) => s.id === id) }
    } catch (err) {
      return fail(`This isn't a valid skill: ${err instanceof Error ? err.message : String(err)}.`)
    }
  })
}

/** Install the previewed files the user confirmed. Returns the new skill ids. */
export function installImport(tokens: unknown): string[] {
  if (!Array.isArray(tokens)) return []
  mkdirSync(userSkillsDir(), { recursive: true })
  const ids: string[] = []
  for (const t of tokens) {
    const item = typeof t === 'string' ? pending.get(t) : undefined
    if (!item) continue
    pending.delete(t as string)
    // Re-validate the exact text we are about to write.
    parseSkill(item.text, item.ext)
    writeFileSync(join(userSkillsDir(), `${item.id}${item.ext}`), item.text, 'utf8')
    ids.push(item.id)
  }
  loadSkills()
  return ids
}

// ---------------------------------------------------------------------------
// Your own skills: create / edit / delete
// ---------------------------------------------------------------------------

export function saveUserSkill(raw: unknown): SkillDetail {
  const d = (raw ?? {}) as Partial<SkillDraft>
  const draft = {
    name: String(d.name ?? '').trim(),
    description: String(d.description ?? '').trim(),
    permissions: Array.isArray(d.permissions) ? d.permissions.map(String) : [],
    instructions: String(d.instructions ?? '').trim()
  }
  const text = toMarkdown({ ...draft, permissions: draft.permissions as PermissionKey[] })
  parseSkill(text, '.md') // validates name, permissions, length

  const existing = typeof d.id === 'string' ? skills.find((s) => s.id === d.id) : undefined
  if (existing && existing.source !== 'user') throw new Error('Built-in skills cannot be edited. Create your own copy instead.')
  const id = existing?.id ?? userIdFor(draft.name)
  if (!existing && skills.some((s) => s.id === id)) throw new Error(`You already have a skill called "${draft.name}".`)

  mkdirSync(userSkillsDir(), { recursive: true })
  // Editing a .json skill turns it into .md (the editor's format).
  const target = join(userSkillsDir(), `${id}.md`)
  writeFileSync(target, text, 'utf8')
  if (existing && existing.path !== target && existsSync(existing.path)) void shell.trashItem(existing.path)
  loadSkills()
  return getSkill(id)
}

export async function deleteUserSkill(id: unknown): Promise<void> {
  const s = skills.find((x) => x.id === id)
  if (!s) return
  if (s.source !== 'user') throw new Error('Built-in skills cannot be deleted; switch them off instead.')
  if (existsSync(s.path)) await shell.trashItem(s.path) // to the Trash, not gone forever
  loadSkills()
}

export async function showUserSkillsFolder(): Promise<void> {
  mkdirSync(userSkillsDir(), { recursive: true })
  await shell.openPath(userSkillsDir())
}
