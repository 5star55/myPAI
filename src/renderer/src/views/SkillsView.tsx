/** Skills: files in the skills/ folder, toggled on or off. */
import { PERMISSION_LABELS, type Profile } from '@shared/ipc'
import { useData } from '../hooks'
import { Toggle } from '../components/Toggle'

export function SkillsView({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const { data, error, reload, setData } = useData(() => window.pai.listSkills(), 'profile')

  async function toggle(id: string, on: boolean) {
    const enabledSkills = on ? [...profile.enabledSkills, id] : profile.enabledSkills.filter((s) => s !== id)
    const res = await window.pai.saveProfile({ ...profile, enabledSkills })
    if (res.ok) onSaved(res.value)
    void reload()
  }

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">Skills</h1>
          <p className="view-sub">
            Each skill is a file in the <code>skills/</code> folder. A skill only works if the permissions it needs are on.
          </p>
        </div>
        <button
          className="btn-ghost"
          onClick={async () => {
            const res = await window.pai.reloadSkills()
            if (res.ok) setData(res.value)
          }}
        >
          Reload files
        </button>
      </header>
      {error && <p className="error-box">{error}</p>}
      {data && data.length === 0 && <p className="empty">No skill files found in skills/.</p>}
      <ul className="cards">
        {data?.map((s) => (
          <li key={s.id} className={`card glass ${s.error ? 'card-error' : ''}`}>
            <div className="card-main">
              <div className="card-text">
                {s.name} <span className="card-meta mono">{s.file}</span>
              </div>
              <div className="card-desc">{s.error ?? s.description}</div>
              <div className="tags">
                {s.permissions.map((p) => (
                  <span key={p} className={`tag ${s.missing.includes(p) ? 'tag-missing' : ''}`} title={PERMISSION_LABELS[p]}>
                    {p}
                  </span>
                ))}
              </div>
              {s.enabled && s.missing.length > 0 && (
                <div className="warning small">Inactive: turn on {s.missing.join(', ')} in Settings.</div>
              )}
            </div>
            <Toggle on={s.enabled} disabled={!!s.error} onChange={(on) => toggle(s.id, on)} label={`Enable ${s.name}`} />
          </li>
        ))}
      </ul>
    </section>
  )
}
