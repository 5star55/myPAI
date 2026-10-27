/**
 * PermissionChecklist — one-click checks for the system permissions pai needs
 * (microphone, text access for Complete my text, notifications).
 */
import { useEffect, useState } from 'react'
import type { ComposeAccess } from '@shared/ipc'

/** Each button asks the system directly. */
export function PermissionChecklist() {
  const [mic, setMic] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [access, setAccess] = useState<ComposeAccess | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const checkAccess = (prompt: boolean) =>
    window.pai.composeAccess(prompt).then((r) => {
      if (r.ok) setAccess(r.value)
    })

  // Show what's already allowed, and re-check when the user comes back from system settings.
  useEffect(() => {
    const refresh = () => {
      void checkAccess(false)
      void window.pai.requestMic(false).then((r) => r.ok && r.value && setMic('granted'))
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  async function allowMic() {
    const r = await window.pai.requestMic()
    setMic(r.ok && r.value ? 'granted' : 'denied')
  }

  async function sendTestNotification() {
    const r = await window.pai.testNotification()
    setNotice(r.ok && r.value ? "Sent. If you can't see it, check your system's notification settings." : 'This system doesn\'t support notifications.')
  }

  return (
    <div className="checklist">
      <h3 className="s-card-title">System permissions</h3>

      <div className="s-row">
        <div className="s-row-text">
          <div className="s-row-label">Microphone (hands-free voice)</div>
          <div className="s-row-help">Needed only for talking to pai. Nothing is recorded or saved.</div>
        </div>
        <div className="s-row-control">
          {mic === 'granted' ? <span className="ok-text">✓ Allowed</span> : <button className="btn-ghost" onClick={allowMic}>Allow microphone</button>}
          {mic === 'denied' && <span className="muted"> Not allowed. Turn it on in system settings.</span>}
        </div>
      </div>

      {access?.available && (
        <div className="s-row">
          <div className="s-row-text">
            <div className="s-row-label">Read text in other apps (Complete my text)</div>
            <div className="s-row-help">Only used when you press the shortcut in an app you allow.</div>
          </div>
          <div className="s-row-control">
            {access.trusted ? (
              <span className="ok-text">✓ Allowed</span>
            ) : (
              <>
                <button className="btn-ghost" onClick={() => checkAccess(true)}>Grant access…</button>
                <button className="btn-ghost" onClick={() => checkAccess(false)}>Check again</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="s-row">
        <div className="s-row-text">
          <div className="s-row-label">Notifications (reminders)</div>
          <div className="s-row-help">Reminders also appear on the orb, so this is optional.</div>
        </div>
        <div className="s-row-control">
          <button className="btn-ghost" onClick={sendTestNotification}>Send test</button>
        </div>
      </div>

      {notice && <p className="card-foot">{notice}</p>}
    </div>
  )
}
