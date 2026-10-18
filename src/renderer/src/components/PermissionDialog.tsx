/**
 * PermissionDialog — shown whenever main asks before running a tool.
 * Requests queue up; one is shown at a time. Escape = deny.
 * Destructive actions arrive twice (stage "ask", then "confirm") and the
 * confirm step is styled as a danger warning. Main enforces both steps.
 * Actions outside the approved folders get an amber warning, and the user
 * can choose to add that folder to the approved list.
 *
 * During a hands-free conversation, SAFE requests are asked out loud and can be
 * answered "yes"/"no". Destructive or outside-folder requests always need a click.
 */
import { useEffect, useRef, useState } from 'react'
import type { PermissionRequest } from '@shared/ipc'
import { usePaiEvent } from '../hooks'
import { handsFree } from '../voice/handsFree'

/** Make a path short enough to say out loud: just the last part. */
const spoken = (target: string) => target.split(/[\\/]/).filter(Boolean).at(-1) ?? target

export function PermissionDialog() {
  const [queue, setQueue] = useState<PermissionRequest[]>([])
  const [always, setAlways] = useState(false)
  const [approveFolder, setApproveFolder] = useState(false)
  const denyRef = useRef<HTMLButtonElement>(null)
  const req = queue[0]

  usePaiEvent('permission:request', (r) => setQueue((q) => [...q, r]))
  usePaiEvent('permission:cancel', ({ id }) => setQueue((q) => q.filter((r) => r.id !== id)))

  useEffect(() => {
    setAlways(false)
    setApproveFolder(false)
    denyRef.current?.focus() // the safe choice gets focus, so Enter never approves by accident
    if (!req || !handsFree.active) return
    let current = true
    const safe = !req.destructive && !req.outside?.length && req.stage === 'ask'
    void (async () => {
      if (!safe) {
        await handsFree.askYesNo('This one needs you to confirm on screen.').catch(() => null)
        return
      }
      const answer = await handsFree.askYesNo(`${req.action}: ${spoken(req.target)}. Should I go ahead?`)
      if (current && answer) answer === 'yes' ? respond(req, true) : respond(req, false)
    })()
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id])

  /** Answer a specific request (used by voice, which may answer after the queue moved on). */
  function respond(r: PermissionRequest, allow: boolean) {
    void window.pai.respondPermission({ id: r.id, allow, always: false, approveFolders: false })
    setQueue((q) => q.filter((x) => x.id !== r.id))
  }

  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && answer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!req) return null

  function answer(allow: boolean) {
    void window.pai.respondPermission({ id: req.id, allow, always: allow && always, approveFolders: allow && approveFolder })
    setQueue((q) => q.slice(1))
  }

  const confirm = req.stage === 'confirm'
  const outside = req.outside ?? []
  return (
    <div className="overlay" role="presentation">
      <div className={`dialog glass ${req.destructive ? 'dialog-danger' : outside.length ? 'dialog-outside' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="perm-title">
        <div className="dialog-kicker">
          {confirm ? 'Second confirmation' : outside.length ? 'Outside your approved folders' : 'Permission needed'}
        </div>
        {req.context && <div className="dialog-context">For task: {req.context}</div>}
        <h2 id="perm-title" className="dialog-title">
          {confirm ? 'Are you absolutely sure?' : req.action}
        </h2>
        {confirm && <p className="dialog-text">This will {req.action.toLowerCase()}. Files go to the Trash, but please double-check.</p>}

        <div className="dialog-field">
          <span>Tool</span>
          <code>{req.tool}</code>
        </div>
        <div className="dialog-field">
          <span>{req.tool === 'run_command' ? 'Command' : 'Target'}</span>
          <code className="dialog-target">{req.target}</code>
        </div>
        {req.preview && req.tool !== 'run_command' && (
          <div className="dialog-field">
            <span>Content</span>
            <pre className="dialog-preview">{req.preview}</pre>
          </div>
        )}

        {outside.length > 0 && !confirm && (
          <div className="outside-box">
            <p>This reaches outside the folders you approved:</p>
            {outside.map((f) => (
              <code key={f}>{f}</code>
            ))}
            <label className="check">
              <input type="checkbox" checked={approveFolder} onChange={(e) => setApproveFolder(e.target.checked)} />
              Also add {outside.length > 1 ? 'these folders' : 'this folder'} to my approved folders
            </label>
          </div>
        )}

        {req.canRemember && (
          <label className="check">
            <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
            Always allow <code>{req.tool}</code> in <code>{req.folder}</code>
          </label>
        )}
        {!req.canRemember && !req.destructive && !outside.length && (
          <p className="dialog-hint">Approving remembers this for the current session.</p>
        )}
        {outside.length > 0 && !approveFolder && <p className="dialog-hint">“Allow once” is not remembered. You will be asked again next time.</p>}

        <div className="dialog-actions">
          <button ref={denyRef} className="btn-secondary" onClick={() => answer(false)}>
            Deny
          </button>
          <button className={req.destructive ? 'btn-danger' : 'btn-primary btn-inline'} onClick={() => answer(true)}>
            {confirm ? 'Yes, do it' : outside.length ? (approveFolder ? 'Allow & approve folder' : 'Allow once') : 'Allow'}
          </button>
        </div>
        {queue.length > 1 && <p className="dialog-hint">{queue.length - 1} more request(s) waiting</p>}
      </div>
    </div>
  )
}
