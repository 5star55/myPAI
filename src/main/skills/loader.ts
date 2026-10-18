/**
 * loader.ts — skills are plain files in the skills/ folder.
 *
 * Markdown (.md) with a small header:
 *   ---
 *   name: File Organizer
 *   description: Keeps folders tidy
 *   permissions: files_read, files_write
 *   ---
 *   Instructions for the assistant go here...
 *
 * or JSON (.json): { "name", "description", "instructions", "permissions": [] }
 *
 * A skill is active only if it is enabled in the profile AND every
 * permission it needs is switched on.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { PERMISSION_KEYS, type PermissionKey, type Profile, type SkillInfo } from '@shared/ipc'
import { skillsDir } from '../paths'

interface Skill extends Omit<SkillInfo, 'enabled' | 'missing'> {
  instructions: string
}

const MAX_INSTRUCTIONS = 4000
let skills: Skill[] = []

function parsePermissions(raw: unknown, file: string): PermissionKey[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const out: PermissionKey[] = []
  for (const p of list.map((x) => String(x).trim()).filter(Boolean)) {
    if (!PERMISSION_KEYS.includes(p as PermissionKey)) throw new Error(`unknown permission "${p}" in ${file}`)
    out.push(p as PermissionKey)
  }
  return out
}

function parseMarkdown(text: string): Record<string, string> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) throw new Error('missing the --- header block')
  const fields: Record<string, string> = { instructions: m[2].trim() }
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*)$/)
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim()
  }
  return fields
}

function loadFile(path: string): Skill {
  const file = basename(path)
  const id = basename(path, extname(path))
  const base = { id, file, name: id, description: '', permissions: [] as PermissionKey[], instructions: '' }
  try {
    const text = readFileSync(path, 'utf8')
    const raw: Record<string, unknown> = extname(path) === '.json' ? JSON.parse(text) : parseMarkdown(text)
    const instructions = String(raw.instructions ?? '').trim()
    if (!instructions) throw new Error('has no instructions')
    return {
      ...base,
      name: String(raw.name ?? id).slice(0, 60),
      description: String(raw.description ?? '').slice(0, 200),
      permissions: parsePermissions(raw.permissions, file),
      instructions: instructions.slice(0, MAX_INSTRUCTIONS)
    }
  } catch (err) {
    return { ...base, error: `Could not load: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** (Re)load all skills from disk. Called at startup and from Settings. */
export function loadSkills(): void {
  try {
    skills = readdirSync(skillsDir())
      .filter((f) => ['.md', '.json'].includes(extname(f).toLowerCase()))
      .sort()
      .map((f) => loadFile(join(skillsDir(), f)))
  } catch (err) {
    console.warn('[skills] no skills folder:', err)
    skills = []
  }
  console.log(`[skills] loaded ${skills.length} skill(s)`)
}

export function listSkills(profile: Profile): SkillInfo[] {
  return skills.map(({ instructions: _i, ...s }) => ({
    ...s,
    enabled: profile.enabledSkills.includes(s.id),
    missing: s.permissions.filter((p) => !profile.permissions[p])
  }))
}

/** Skills that will be added to the system prompt. */
export function activeSkills(profile: Profile): Skill[] {
  return skills.filter(
    (s) => !s.error && profile.enabledSkills.includes(s.id) && s.permissions.every((p) => profile.permissions[p])
  )
}
