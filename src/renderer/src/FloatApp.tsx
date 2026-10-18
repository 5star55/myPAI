/**
 * FloatApp — the always-on-top orb window.
 *   click        -> open/close chat
 *   drag         -> move it (we move the window ourselves so clicks still work)
 *   right-click  -> menu (on/off, quiet mode, quit)
 * Proactive offers appear as a card next to the orb.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { AppState, Offer } from '@shared/ipc'
import { usePaiEvent } from './hooks'

const CLICK_SLOP_PX = 4

export function FloatApp() {
  const [state, setState] = useState<AppState>({ enabled: true, quietMode: false })
  const [offer, setOffer] = useState<Offer | null>(null)
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null)

  useEffect(() => {
    document.body.classList.add('float-body')
    window.pai.getState().then((r) => r.ok && setState(r.value))
  }, [])
  usePaiEvent('state:changed', setState)
  usePaiEvent('offer:show', setOffer)
  usePaiEvent('offer:clear', ({ id }) => setOffer((o) => (o?.id === id ? null : o)))

  function onDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.screenX, y: e.screenY, moved: 0 }
  }
  function onMove(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.screenX - d.x
    const dy = e.screenY - d.y
    if (dx || dy) {
      d.moved += Math.abs(dx) + Math.abs(dy)
      d.x = e.screenX
      d.y = e.screenY
      void window.pai.dragFloat(dx, dy)
    }
  }
  function onUp() {
    const d = drag.current
    drag.current = null
    if (d && d.moved < CLICK_SLOP_PX) void window.pai.toggleChat()
  }

  const respond = (choice: 'accept' | 'dismiss' | 'snooze') => {
    if (offer) void window.pai.respondOffer(offer.id, choice)
    setOffer(null)
  }

  return (
    <div className="float-root">
      {offer && (
        <div className="offer glass" role="dialog" aria-label="Suggestion">
          <p className="offer-text">{offer.text}</p>
          <div className="offer-actions">
            <button className="btn-primary btn-inline btn-sm" onClick={() => respond('accept')}>
              {offer.acceptLabel}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => respond('snooze')}>
              Snooze
            </button>
            <button className="btn-ghost btn-sm" onClick={() => respond('dismiss')}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <button
        className={`float-orb ${state.enabled ? '' : 'float-off'} ${state.quietMode ? 'float-quiet' : ''} ${offer ? 'float-alert' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onContextMenu={(e) => {
          e.preventDefault()
          void window.pai.showFloatMenu()
        }}
        title={state.enabled ? 'Click: chat · Drag: move · Right-click: menu' : 'Assistant is OFF · Right-click: menu'}
        aria-label="Open chat"
      >
        <span className="orb-ring" />
        <span className="orb-ring orb-ring-2" />
        <span className="orb-core" />
      </button>
    </div>
  )
}
