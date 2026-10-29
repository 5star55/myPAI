/**
 * Form sections shared by the Setup wizard and Settings.
 * Each takes the profile being edited and a setter for a patch.
 */
import { PERMISSION_KEYS, PERMISSION_LABELS, TONES, type PermissionKey, type Profile, type SkillInfo } from '@shared/ipc'
import { Toggle } from './Toggle'

type Patch = (p: Partial<Profile>) => void

const TONE_HINT: Record<Profile['tone'], string> = {
  friendly: 'Warm and encouraging',
  professional: 'Clear and precise',
  playful: 'Light, with the odd joke',
  concise: 'Short answers, no filler'
}

const RISKY: PermissionKey[] = ['files_write', 'files_delete', 'apps', 'web']

export function IdentityFields({ profile, set }: { profile: Profile; set: Patch }) {
  return (
    <div className="fields">
      <label className="field">
        <span>Assistant name</span>
        <input value={profile.assistantName} onChange={(e) => set({ assistantName: e.target.value })} maxLength={40} placeholder="pai" />
      </label>
      <label className="field">
        <span>Your name (optional)</span>
        <input value={profile.userName} onChange={(e) => set({ userName: e.target.value })} maxLength={60} placeholder="What should it call you?" />
      </label>
      <div className="field">
        <span>Tone</span>
        <div className="choice-grid">
          {TONES.map((t) => (
            <button key={t} type="button" className={`choice choice-tone glass ${profile.tone === t ? 'choice-on' : ''}`} onClick={() => set({ tone: t })}>
              <strong>{t}</strong>
              <small>{TONE_HINT[t]}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function FoldersField({ profile, set }: { profile: Profile; set: Patch }) {
  async function add() {
    const res = await window.pai.pickFolder()
    if (res.ok && res.value && !profile.approvedFolders.includes(res.value)) {
      set({ approvedFolders: [...profile.approvedFolders, res.value] })
    }
  }
  const all = profile.folderAccess === 'all'
  return (
    <div className="fields">
      <div className="toggle-row">
        <div>
          <strong>Allow all folders</strong>
          <p className="hint">
            {all
              ? 'Work with files anywhere on this computer. Every change still asks you first, and system folders, keys and pai’s own files are always off-limits.'
              : 'Off: only the folders below. Anything else asks with an extra warning.'}
          </p>
        </div>
        <Toggle on={all} onChange={(on) => set({ folderAccess: on ? 'all' : 'approved' })} label="Allow all folders" />
      </div>
      <p className="hint">
        {all
          ? 'Favorite folders: suggested while you type, and where new things go when you don’t say.'
          : 'The assistant can only touch files inside these folders. This is enforced in code, not just asked nicely.'}
      </p>
      <ul className="folder-list">
        {profile.approvedFolders.map((f) => (
          <li key={f} className="folder glass">
            <code>{f}</code>
            <button type="button" className="btn-ghost danger" onClick={() => set({ approvedFolders: profile.approvedFolders.filter((x) => x !== f) })}>
              Remove
            </button>
          </li>
        ))}
        {profile.approvedFolders.length === 0 && (
          <li className="empty">{all ? 'None yet (optional).' : 'No folders yet. File tools will refuse everything.'}</li>
        )}
      </ul>
      <button type="button" className="btn-ghost" onClick={add}>
        + Add folder…
      </button>
    </div>
  )
}

export function PermissionsField({ profile, set }: { profile: Profile; set: Patch }) {
  return (
    <div className="fields">
      <p className="hint">Even when a permission is on, you still approve each action in a dialog. Off means the tool is never offered at all.</p>
      <ul className="perm-list">
        {PERMISSION_KEYS.map((k) => (
          <li key={k} className="perm">
            <div>
              <div>{PERMISSION_LABELS[k]}</div>
              <code className="perm-key">{k}</code>
              {RISKY.includes(k) && <span className="tag tag-risky">changes things</span>}
            </div>
            <Toggle on={profile.permissions[k]} onChange={(on) => set({ permissions: { ...profile.permissions, [k]: on } })} label={PERMISSION_LABELS[k]} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SkillsField({ profile, set, skills }: { profile: Profile; set: Patch; skills: SkillInfo[] }) {
  return (
    <div className="fields">
      <ul className="perm-list">
        {skills.map((s) => {
          const missing = s.permissions.filter((p) => !profile.permissions[p])
          const on = profile.enabledSkills.includes(s.id)
          return (
            <li key={s.id} className="perm">
              <div>
                <div>{s.name}</div>
                <small className="muted">{s.error ?? s.description}</small>
                {on && missing.length > 0 && <div className="warning small">Needs: {missing.join(', ')}</div>}
              </div>
              <Toggle
                on={on}
                disabled={!!s.error}
                label={s.name}
                onChange={(v) => set({ enabledSkills: v ? [...profile.enabledSkills, s.id] : profile.enabledSkills.filter((x) => x !== s.id) })}
              />
            </li>
          )
        })}
        {skills.length === 0 && <li className="empty">No skills found in the skills/ folder.</li>}
      </ul>
    </div>
  )
}

export function ProactiveField({ profile, set }: { profile: Profile; set: Patch }) {
  return (
    <div className="perm">
      <div>
        <div>Proactive offers</div>
        <small className="muted">
          Watches the active app and your Downloads folder (if approved) and offers help. It never acts without you. Window titles stay in memory only.
        </small>
      </div>
      <Toggle on={profile.proactive} onChange={(on) => set({ proactive: on })} label="Proactive offers" />
    </div>
  )
}
