/** Settings: edit the generated profile, quiet mode, and saved "always allow" approvals. */
import { useEffect, useState } from 'react'
import type { AppState, Profile, PublicConfig, SkillInfo } from '@shared/ipc'
import { FoldersField, IdentityFields, PermissionsField, ProactiveField, SkillsField } from '../components/ProfileFields'
import { Toggle } from '../components/Toggle'

interface Props {
  profile: Profile
  state: AppState
  config: PublicConfig | null
  onSaved: (p: Profile) => void
}

export function SettingsView({ profile: saved, state, config, onSaved }: Props) {
  const [profile, setProfile] = useState(saved)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [approvals, setApprovals] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }))
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved)

  useEffect(() => setProfile(saved), [saved])
  useEffect(() => {
    window.pai.listSkills().then((r) => r.ok && setSkills(r.value))
    window.pai.listApprovals().then((r) => r.ok && setApprovals(r.value))
  }, [])

  async function save() {
    const res = await window.pai.saveProfile(profile)
    if (res.ok) {
      onSaved(res.value)
      setStatus('Saved.')
    } else setStatus(res.error)
    setTimeout(() => setStatus(null), 2500)
  }

  return (
    <section className="view">
      <header className="view-head sticky">
        <div>
          <h1 className="view-title">Settings</h1>
          <p className="view-sub">Your generated AI. Changes apply to the next message.</p>
        </div>
        <div className="row">
          {status && <span className="muted">{status}</span>}
          <button className="btn-ghost" onClick={() => setProfile(saved)} disabled={!dirty}>
            Discard
          </button>
          <button className="btn-primary btn-inline" onClick={save} disabled={!dirty}>
            Save
          </button>
        </div>
      </header>

      <div className="settings-grid">
        <Panel title="Status">
          <div className="perm">
            <div>
              <div>Assistant on</div>
              <small className="muted">The off switch. Off stops the current reply and denies every pending action.</small>
            </div>
            <Toggle on={state.enabled} onChange={(on) => window.pai.setEnabled(on)} label="Assistant on" />
          </div>
          <div className="perm">
            <div>
              <div>Quiet mode</div>
              <small className="muted">No proactive offers until you turn this off.</small>
            </div>
            <Toggle on={state.quietMode} onChange={(on) => window.pai.setQuiet(on)} label="Quiet mode" />
          </div>
          <ProactiveField profile={profile} set={set} />
          {config && (
            <p className="hint">
              Model: <code>{config.mode}</code> · chat <code>{config.smallModel}</code> · tools <code>{config.bigModel}</code> · web search{' '}
              <code>{config.webSearchConfigured ? 'configured' : 'not configured'}</code>. Edit <code>.env</code> and restart to change.
            </p>
          )}
        </Panel>

        <Panel title="Identity">
          <IdentityFields profile={profile} set={set} />
        </Panel>
        <Panel title="Approved folders">
          <FoldersField profile={profile} set={set} />
        </Panel>
        <Panel title="Permissions">
          <PermissionsField profile={profile} set={set} />
        </Panel>
        <Panel title="Skills">
          <SkillsField profile={profile} set={set} skills={skills} />
        </Panel>

        <Panel title="Always-allowed actions">
          {approvals.length === 0 && <p className="empty">None. Tick “always allow” in a permission dialog to add one.</p>}
          <ul className="folder-list">
            {approvals.map((key) => {
              const [tool, folder] = key.split('|')
              return (
                <li key={key} className="folder glass">
                  <span>
                    <code>{tool}</code> in <code>{folder}</code>
                  </span>
                  <button
                    className="btn-ghost danger"
                    onClick={async () => {
                      const r = await window.pai.removeApproval(key)
                      if (r.ok) setApprovals(r.value)
                    }}
                  >
                    Revoke
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title="Start over">
          <p className="hint">Run the “Generate your AI” setup again. Memory and logs are kept.</p>
          <button className="btn-ghost" onClick={async () => {
            const r = await window.pai.saveProfile({ ...saved, setupComplete: false })
            if (r.ok) onSaved(r.value)
          }}>
            Re-run setup
          </button>
        </Panel>
      </div>
    </section>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass panel settings-panel">
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  )
}
