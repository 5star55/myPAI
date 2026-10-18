/**
 * Skills — built-in skills plus your own (uploaded or written here).
 *
 * Uploading: choose or drop .md/.json files -> review each one (name,
 * permissions, full instructions) -> Install. New skills start switched off.
 * Skills are instructions only; they can never grant permissions.
 */
import { useState, type DragEvent } from 'react'
import { PERMISSION_KEYS, PERMISSION_LABELS, type PermissionKey, type Profile, type SkillDraft, type SkillImport, type SkillInfo } from '@shared/ipc'
import { Toggle } from '../components/Toggle'
import { useData } from '../hooks'

const MAX_INSTRUCTIONS = 4000
const EMPTY_DRAFT: SkillDraft = { name: '', description: '', permissions: [], instructions: '' }

export function SkillsView({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const { data, error, reload } = useData(() => window.pai.listSkills(), 'skills')
  const [imports, setImports] = useState<SkillImport[] | null>(null)
  const [editor, setEditor] = useState<{ draft: SkillDraft; readOnly: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const mine = data?.filter((s) => s.source === 'user') ?? []
  const builtIn = data?.filter((s) => s.source === 'builtin') ?? []

  async function toggle(id: string, on: boolean) {
    const enabledSkills = on ? [...profile.enabledSkills, id] : profile.enabledSkills.filter((s) => s !== id)
    const res = await window.pai.saveProfile({ ...profile, enabledSkills })
    if (res.ok) onSaved(res.value)
    void reload()
  }

  async function upload() {
    const res = await window.pai.pickSkillFiles()
    if (res.ok && res.value.length) setImports(res.value)
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files]
    if (!files.length) return
    const res = await window.pai.previewSkillFiles(files)
    if (res.ok) setImports(res.value)
  }

  async function open(s: SkillInfo) {
    const res = await window.pai.getSkill(s.id)
    if (!res.ok) return setNotice(res.error)
    const { id, name, description, permissions, instructions } = res.value
    setEditor({ draft: { id, name, description, permissions, instructions }, readOnly: s.source === 'builtin' })
  }

  async function remove(id: string) {
    const res = await window.pai.deleteSkill(id)
    setConfirmDelete(null)
    if (!res.ok) return setNotice(res.error)
    const p = await window.pai.getProfile()
    if (p.ok) onSaved(p.value)
    setNotice('Skill moved to the Trash.')
    void reload()
  }

  return (
    <section
      className={`view skills-view ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <header className="view-head">
        <div>
          <h1 className="view-title">Skills</h1>
          <p className="view-sub">Extra know-how for {profile.assistantName}. A skill only works when the permissions it needs are on.</p>
        </div>
        <div className="row">
          <button className="btn-ghost" onClick={() => window.pai.showSkillsFolder()} title="Open the folder with your skill files">
            Open folder
          </button>
          <button className="btn-ghost" onClick={() => setEditor({ draft: { ...EMPTY_DRAFT }, readOnly: false })}>
            + New skill
          </button>
          <button className="btn-primary btn-inline" onClick={upload}>
            Upload skills…
          </button>
        </div>
      </header>

      {error && <p className="error-box">{error}</p>}
      {notice && (
        <p className="notice" onAnimationEnd={() => setNotice(null)}>
          {notice}
        </p>
      )}

      <h2 className="skills-section">Your skills</h2>
      {mine.length === 0 ? (
        <div className="drop-hint glass" onClick={upload} role="button" tabIndex={0}>
          <div className="drop-icon" aria-hidden>
            ⇪
          </div>
          <div>
            <strong>Drop skill files here</strong> or click to upload (.md or .json)
          </div>
          <small>…or write one with “New skill”. You'll review every file before it's installed.</small>
        </div>
      ) : (
        <ul className="cards">
          {mine.map((s) => (
            <SkillCard key={s.id} s={s} onToggle={toggle} onOpen={open} confirming={confirmDelete === s.id} onDelete={() => setConfirmDelete(s.id)} onConfirmDelete={() => remove(s.id)} onCancelDelete={() => setConfirmDelete(null)} />
          ))}
        </ul>
      )}

      <h2 className="skills-section">Built-in</h2>
      <ul className="cards">
        {builtIn.map((s) => (
          <SkillCard key={s.id} s={s} onToggle={toggle} onOpen={open} />
        ))}
      </ul>

      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay-box">Drop to review skill files</div>
        </div>
      )}

      {imports && (
        <ImportReview
          items={imports}
          onCancel={() => setImports(null)}
          onInstalled={(n) => {
            setImports(null)
            setNotice(`Installed ${n} skill${n === 1 ? '' : 's'}. They start switched off; turn them on below.`)
            void reload()
          }}
        />
      )}

      {editor && (
        <SkillEditor
          initial={editor.draft}
          readOnly={editor.readOnly}
          onClose={() => setEditor(null)}
          onCopy={() => setEditor({ draft: { ...editor.draft, id: undefined, name: `${editor.draft.name} (my copy)` }, readOnly: false })}
          onSaved={() => {
            setEditor(null)
            setNotice('Skill saved.')
            void reload()
          }}
        />
      )}
    </section>
  )
}

function PermTags({ perms, missing = [] }: { perms: PermissionKey[]; missing?: PermissionKey[] }) {
  if (perms.length === 0) return <span className="tag">no special permissions</span>
  return (
    <>
      {perms.map((p) => (
        <span key={p} className={`tag ${missing.includes(p) ? 'tag-missing' : ''} ${p === 'shell' ? 'tag-risky' : ''}`} title={PERMISSION_LABELS[p]}>
          {p}
        </span>
      ))}
    </>
  )
}

interface CardProps {
  s: SkillInfo
  onToggle: (id: string, on: boolean) => void
  onOpen: (s: SkillInfo) => void
  confirming?: boolean
  onDelete?: () => void
  onConfirmDelete?: () => void
  onCancelDelete?: () => void
}

function SkillCard({ s, onToggle, onOpen, confirming, onDelete, onConfirmDelete, onCancelDelete }: CardProps) {
  return (
    <li className={`card glass skill-card ${s.error ? 'card-error' : ''}`}>
      <div className="card-main">
        <div className="card-text">
          {s.name} {s.source === 'user' && <span className="badge badge-ok">yours</span>}
        </div>
        <div className="card-desc">{s.error ?? (s.description || 'No description.')}</div>
        <div className="tags">
          <PermTags perms={s.permissions} missing={s.missing} />
        </div>
        {s.enabled && s.missing.length > 0 && <div className="warning small">Inactive: turn on {s.missing.join(', ')} in Settings → Permissions.</div>}
        <div className="skill-actions">
          {!s.error && (
            <button className="link-btn" onClick={() => onOpen(s)}>
              {s.source === 'user' ? 'Edit' : 'View'}
            </button>
          )}
          {onDelete &&
            (confirming ? (
              <>
                <button className="link-btn danger" onClick={onConfirmDelete}>
                  Move to Trash
                </button>
                <button className="link-btn" onClick={onCancelDelete}>
                  Keep
                </button>
              </>
            ) : (
              <button className="link-btn danger" onClick={onDelete}>
                Delete
              </button>
            ))}
        </div>
      </div>
      <Toggle on={s.enabled} disabled={!!s.error} onChange={(on) => onToggle(s.id, on)} label={`Enable ${s.name}`} />
    </li>
  )
}

/** Review uploaded files before anything is installed. */
function ImportReview({ items, onCancel, onInstalled }: { items: SkillImport[]; onCancel: () => void; onInstalled: (n: number) => void }) {
  const valid = items.filter((i) => !i.error)
  const [chosen, setChosen] = useState<Set<string>>(new Set(valid.map((i) => i.token)))
  const [openToken, setOpenToken] = useState<string | null>(valid.length === 1 ? valid[0].token : null)
  const [busy, setBusy] = useState(false)

  async function install() {
    setBusy(true)
    const res = await window.pai.installSkills([...chosen])
    setBusy(false)
    if (res.ok) onInstalled(res.value.length)
  }

  return (
    <div className="overlay" role="presentation">
      <div className="dialog glass dialog-wide" role="dialog" aria-modal="true" aria-labelledby="imp-title">
        <div className="dialog-kicker">Review before installing</div>
        <h2 id="imp-title" className="dialog-title">
          {items.length === 1 ? 'Install this skill?' : `Install ${valid.length} of ${items.length} skills?`}
        </h2>
        <p className="dialog-text-dim">
          A skill's instructions are followed like your own words, so only install skills you trust. They can't grant permissions:
          every action still asks you.
        </p>
        <ul className="import-list">
          {items.map((i) =>
            i.error ? (
              <li key={i.file} className="import-item import-bad">
                <strong>{i.file}</strong>
                <span>{i.error}</span>
              </li>
            ) : (
              <li key={i.token} className="import-item">
                <label className="import-head">
                  <input
                    type="checkbox"
                    checked={chosen.has(i.token)}
                    onChange={(e) => {
                      const next = new Set(chosen)
                      if (e.target.checked) next.add(i.token)
                      else next.delete(i.token)
                      setChosen(next)
                    }}
                  />
                  <span className="import-name">{i.name}</span>
                  <span className="muted mono">{i.file}</span>
                </label>
                {i.description && <div className="card-desc">{i.description}</div>}
                <div className="tags">
                  <PermTags perms={i.permissions} />
                </div>
                {i.replaces && <div className="warning small">Replaces your existing skill with the same name.</div>}
                {i.permissions.includes('shell') && (
                  <div className="warning small danger-text">This skill wants to run terminal commands. Read its instructions carefully.</div>
                )}
                <button className="link-btn" onClick={() => setOpenToken(openToken === i.token ? null : i.token)}>
                  {openToken === i.token ? 'Hide instructions' : 'Read instructions'}
                </button>
                {openToken === i.token && <pre className="dialog-preview import-instructions">{i.instructions}</pre>}
              </li>
            )
          )}
        </ul>
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary btn-inline" onClick={install} disabled={chosen.size === 0 || busy}>
            {busy ? 'Installing…' : `Install${chosen.size > 1 ? ` ${chosen.size}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Write or edit one of your own skills (or view a built-in one). */
function SkillEditor({ initial, readOnly, onClose, onCopy, onSaved }: { initial: SkillDraft; readOnly: boolean; onClose: () => void; onCopy: () => void; onSaved: () => void }) {
  const [d, setD] = useState<SkillDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<SkillDraft>) => setD((x) => ({ ...x, ...patch }))
  const togglePerm = (p: PermissionKey) => set({ permissions: d.permissions.includes(p) ? d.permissions.filter((x) => x !== p) : [...d.permissions, p] })

  async function save() {
    const res = await window.pai.saveSkill(d)
    if (res.ok) onSaved()
    else setError(res.error)
  }

  return (
    <div className="overlay" role="presentation">
      <div className="dialog glass dialog-wide" role="dialog" aria-modal="true" aria-labelledby="ed-title">
        <div className="dialog-kicker">{readOnly ? 'Built-in skill' : d.id ? 'Edit skill' : 'New skill'}</div>
        <h2 id="ed-title" className="dialog-title">
          {readOnly ? d.name : d.name || 'Untitled skill'}
        </h2>
        <div className="fields">
          {!readOnly && (
            <>
              <label className="field">
                <span>Name</span>
                <input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="e.g. Study Buddy" autoFocus />
              </label>
              <label className="field">
                <span>Description</span>
                <input value={d.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} placeholder="One line about what it helps with" />
              </label>
            </>
          )}
          {readOnly && d.description && <p className="card-desc">{d.description}</p>}
          <div className="field">
            <span>Permissions it needs</span>
            <div className="perm-picks">
              {PERMISSION_KEYS.map((p) => (
                <label key={p} className={`perm-pick ${d.permissions.includes(p) ? 'on' : ''}`}>
                  <input type="checkbox" checked={d.permissions.includes(p)} onChange={() => togglePerm(p)} disabled={readOnly} />
                  {PERMISSION_LABELS[p]}
                </label>
              ))}
            </div>
          </div>
          <label className="field">
            <span>
              Instructions{' '}
              <small className="muted">
                ({d.instructions.length}/{MAX_INSTRUCTIONS})
              </small>
            </span>
            <textarea
              className="skill-textarea"
              value={d.instructions}
              onChange={(e) => set({ instructions: e.target.value.slice(0, MAX_INSTRUCTIONS) })}
              readOnly={readOnly}
              placeholder={'When the user asks to study:\n1. Read their notes file.\n2. Ask 3 quiz questions, one at a time.\n3. Explain any wrong answers kindly.'}
              rows={10}
            />
          </label>
          {error && <p className="error-box">{error}</p>}
        </div>
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {readOnly ? (
            <button className="btn-primary btn-inline" onClick={onCopy}>
              Make my own copy
            </button>
          ) : (
            <button className="btn-primary btn-inline" onClick={save} disabled={!d.name.trim() || !d.instructions.trim()}>
              Save skill
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
