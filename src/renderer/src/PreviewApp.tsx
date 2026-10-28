/**
 * PreviewApp — the toolbar of the preview browser (#preview).
 * The page itself is drawn by main underneath this bar; this only steers it.
 */
import { useEffect, useState, type FormEvent } from 'react'
import type { PreviewAction, PreviewState } from '@shared/ipc'
import { usePaiEvent } from './hooks'

const EMPTY: PreviewState = { url: '', title: '', loading: false, canGoBack: false, canGoForward: false, errors: 0 }

export function PreviewApp() {
  const [state, setState] = useState<PreviewState>(EMPTY)
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function nav(action: PreviewAction, url?: string) {
    const res = await window.pai.previewNav(action, url)
    if (res.ok) {
      setState(res.value)
      setError(null)
    } else setError(res.error)
  }

  useEffect(() => {
    void nav('state')
  }, [])
  usePaiEvent('preview:state', (s) => setState(s))
  useEffect(() => {
    if (!editing) setAddress(state.url)
    document.title = state.title ? `Preview · ${state.title}` : 'Preview'
  }, [state, editing])

  function go(e: FormEvent) {
    e.preventDefault()
    setEditing(false)
    if (address.trim()) void nav('go', address.trim())
  }

  return (
    <div className="preview-bar">
      <button className="pv-btn" onClick={() => nav('back')} disabled={!state.canGoBack} title="Back" aria-label="Back">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="pv-btn" onClick={() => nav('forward')} disabled={!state.canGoForward} title="Forward" aria-label="Forward">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className={`pv-btn ${state.loading ? 'pv-spin' : ''}`} onClick={() => nav('reload')} title="Reload" aria-label="Reload">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <form className="pv-address" onSubmit={go}>
        <span className={`pv-dot ${state.loading ? 'pv-dot-loading' : ''}`} aria-hidden />
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => {
            setEditing(true)
            e.target.select()
          }}
          onBlur={() => setEditing(false)}
          placeholder="http://localhost:3000"
          spellCheck={false}
          aria-label="Address"
          title={error ?? state.url}
        />
      </form>
      {state.errors > 0 && (
        <button className="pv-errors" onClick={() => nav('devtools')} title="Console errors: open the developer tools">
          {state.errors} error{state.errors === 1 ? '' : 's'}
        </button>
      )}
      <button className="pv-btn" onClick={() => nav('devtools')} title="Developer tools" aria-label="Developer tools">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="pv-btn" onClick={() => nav('external')} disabled={!state.url} title="Open in your browser" aria-label="Open in your browser">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
