/**
 * ComposeApp — the "Complete my text" popup next to the caret in another app.
 *   1-3 or ↑↓ + Enter: insert that option   R: new options   Esc: close
 */
import { useEffect, useState } from 'react'
import type { ComposeView } from '@shared/ipc'
import { usePaiEvent } from './hooks'

export function ComposeApp() {
  const [view, setView] = useState<ComposeView>({ state: 'loading', app: '' })
  const [active, setActive] = useState(0)

  useEffect(() => document.body.classList.add('compose-body'), [])
  usePaiEvent('compose:view', (v) => {
    setView(v)
    setActive(0)
  })

  const options = view.state === 'ready' ? view.options : []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return void window.pai.composeCancel()
      if (view.state === 'error' && e.key === 'Enter' && view.action) return void window.pai.composeAction()
      if (view.state !== 'ready') return
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) return void window.pai.composeChoose(n - 1)
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault()
        setActive((a) => (a + 1) % options.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + options.length) % options.length)
      } else if (e.key === 'Enter') void window.pai.composeChoose(active)
      else if (e.key.toLowerCase() === 'r') void window.pai.composeAction()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, options.length, active])

  return (
    <div className="compose glass" role="dialog" aria-label="Complete my text">
      <header className="compose-head">
        <span className="compose-brand">✦ Complete{view.app ? ` · ${view.app}` : ''}</span>
        <button className="icon-mini" onClick={() => window.pai.composeCancel()} aria-label="Close">
          ×
        </button>
      </header>

      {view.state === 'loading' && (
        <div className="compose-loading" role="status">
          <span className="compose-dot" />
          <span className="compose-dot" />
          <span className="compose-dot" />
          <span className="muted">Writing…</span>
        </div>
      )}

      {view.state === 'ready' && (
        <ol className="compose-list">
          {view.options.map((o, i) => (
            <li key={o}>
              <button className={`compose-opt ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => window.pai.composeChoose(i)}>
                <kbd className="key">{i + 1}</kbd>
                <span className="compose-text">
                  {view.tail && <span className="compose-tail">{view.tail} </span>}
                  {o}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {view.state === 'error' && (
        <div className="compose-error">
          <p>{view.message}</p>
          {view.action && (
            <button className="btn-primary btn-inline btn-sm" onClick={() => window.pai.composeAction()}>
              {view.action.label}
            </button>
          )}
        </div>
      )}

      <footer className="compose-foot">
        {view.state === 'ready' ? (
          <>
            <kbd className="key">1</kbd>–<kbd className="key">{options.length}</kbd> or <kbd className="key">↵</kbd> insert · <kbd className="key">R</kbd> new ·{' '}
            <kbd className="key">esc</kbd> close
          </>
        ) : (
          <>
            <kbd className="key">esc</kbd> close
          </>
        )}
      </footer>
    </div>
  )
}
