/**
 * profile.ts — the user's "generated AI": name, tone, folders, permissions, skills.
 * Saved to profile.json and used to build the system prompt.
 */
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { DEFAULT_VOICE, NATURAL_VOICES, PERMISSION_KEYS, TONES, type PermissionKey, type Profile, type VoiceChoice } from '@shared/ipc'
import { defaultComposeSettings, sanitizeCompose } from '@shared/compose'
import { dataFile } from '../paths'
import { JsonStore, isObj, str } from './jsonStore'

/**
 * Defaults: everything useful is on. That is safe because every single action
 * still needs the user's OK in the permission dialog. Delete stays off until the
 * user opts in, since it is the one action that can lose work.
 */
const DEFAULT_PERMISSIONS: Record<PermissionKey, boolean> = {
  files_read: true,
  files_write: true,
  files_delete: false,
  documents: true,
  apps: true,
  reminders: true,
  web: true,
  memory: true,
  shell: true // each command still asks unless "run and report" is chosen
}

export function defaultProfile(): Profile {
  return {
    setupComplete: false,
    assistantName: 'pai',
    userName: '',
    tone: 'friendly',
    approvedFolders: [],
    permissions: { ...DEFAULT_PERMISSIONS },
    enabledSkills: [],
    proactive: true,
    wakeWord: false,
    voice: { ...DEFAULT_VOICE },
    commandMode: 'ask',
    compose: defaultComposeSettings()
  }
}

function sanitizeVoice(raw: unknown): VoiceChoice {
  if (!isObj(raw)) return { ...DEFAULT_VOICE }
  const engine = raw.engine === 'system' ? 'system' : 'natural'
  const rate = typeof raw.rate === 'number' && Number.isFinite(raw.rate) ? Math.min(1.3, Math.max(0.8, raw.rate)) : 1
  let voice = str(raw.voice).slice(0, 100)
  if (engine === 'natural' && !NATURAL_VOICES.some((v) => v.id === voice)) voice = DEFAULT_VOICE.voice
  return { engine, voice, rate }
}

/** Expand "~" and make a path absolute. */
export function normalizeFolder(p: string): string {
  const expanded = p.startsWith('~') ? p.replace(/^~/, homedir()) : p
  return resolve(expanded)
}

/** Validate any profile-shaped input (from disk or from the renderer). */
export function sanitizeProfile(raw: unknown): Profile {
  const d = defaultProfile()
  if (!isObj(raw)) return d
  const perms = isObj(raw.permissions) ? raw.permissions : {}
  const folders = Array.isArray(raw.approvedFolders) ? raw.approvedFolders : []
  const skills = Array.isArray(raw.enabledSkills) ? raw.enabledSkills : []
  return {
    setupComplete: raw.setupComplete === true,
    assistantName: str(raw.assistantName, d.assistantName).trim().slice(0, 40) || d.assistantName,
    userName: str(raw.userName).trim().slice(0, 60),
    tone: TONES.includes(raw.tone as never) ? (raw.tone as Profile['tone']) : d.tone,
    approvedFolders: [
      ...new Set(
        folders
          .filter((f): f is string => typeof f === 'string' && f.trim() !== '')
          .map((f) => normalizeFolder(f.trim()))
          .filter((f) => isAbsolute(f))
      )
    ],
    permissions: Object.fromEntries(
      PERMISSION_KEYS.map((k) => [k, typeof perms[k] === 'boolean' ? perms[k] : d.permissions[k]])
    ) as Record<PermissionKey, boolean>,
    enabledSkills: [...new Set(skills.filter((s): s is string => typeof s === 'string'))],
    proactive: typeof raw.proactive === 'boolean' ? raw.proactive : d.proactive,
    wakeWord: raw.wakeWord === true,
    voice: sanitizeVoice(raw.voice),
    commandMode: raw.commandMode === 'auto' ? 'auto' : 'ask',
    compose: sanitizeCompose(raw.compose)
  }
}

export const profileStore = new JsonStore<Profile>(() => dataFile('profile.json'), defaultProfile, sanitizeProfile)
