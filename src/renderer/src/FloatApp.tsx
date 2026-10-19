/**
 * FloatApp — the always-on-top orb: a mini Ecospace.
 *   click        -> open/close the mini Ecospace (type or say a task, watch it run)
 *   drag         -> move it (we move the window ourselves so clicks still work)
 *   right-click  -> menu (talk, Ecospace, chat, on/off, quiet mode, quit)
 * When the panel is closed it still shows proactive offers and the voice status as a card.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react'
import type { AppState, FloatSize, Offer, Suggestion, VoiceStatus } from '@shared/ipc'
import { TaskCard } from './components/TaskCard'
import { usePaiEvent } from './hooks'
import { isActiveTask, useTasks } from './tasks'
import { chime } from './audio'

const CLICK_SLOP_PX = 4
const MAX_MINI_SUGGESTIONS = 4
const VOICE_LABEL: Record<VoiceStatus['state'], string> = {
  idle: '',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  review: 'Heard you say'
}

export function FloatApp() {
  const [state, setState] = useState<AppState>({ enabled: true, quietMode: false })
  const [offer, setOffer] = useState<Offer | null>(null)
  const [voice, setVoice] = useState<VoiceStatus>({ state: 'idle' })
  const [panel, setPanel] = useState(false)
  // Reminders that went off and haven't been dismissed yet (oldest first).
  const [reminders, setReminders] = useState<{ id: string; message: string }[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const tasks = useTasks()
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.body.classList.add('float-body')
    window.pai.getState().then((r) => r.ok && setState(r.value))
  }, [])
  usePaiEvent('state:changed', setState)
  usePaiEvent('offer:show', setOffer)
  usePaiEvent('offer:clear', ({ id }) => setOffer((o) => (o?.id === id ? null : o)))
  usePaiEvent('reminder:fired', (r) => {
    chime('start')
    setReminders((list) => [...list.filter((x) => x.id !== r.id), r])
  })
  usePaiEvent('voice:status', (s) => {
    clearTimeout(hideTimer.current)
    setVoice(s)
    // An idle message (e.g. "mic is off") stays a few seconds, then the card closes.
    if (s.state === 'idle' && s.caption) hideTimer.current = setTimeout(() => setVoice({ state: 'idle' }), 4000)
  })

  const voiceCard = voice.state !== 'idle' || !!voice.caption
  const reminder = reminders[0]
  const size: FloatSize = panel ? 'panel' : reminder || offer || voiceCard ? 'card' : 'orb'
  const closeReminder = (snooze: boolean) => {
    if (!reminder) return
    if (snooze) void window.pai.snoozeReminder(reminder.message)
    setReminders((list) => list.slice(1))
  }
  useEffect(() => {
    void window.pai.setFloatExpanded(size)
  }, [size])

  // Opening the panel: take keyboard focus so you can type right away. Esc closes it.
  useEffect(() => {
    if (!panel) return
    void window.pai.focusFloat().then(() => inputRef.current?.focus())
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

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
    if (d && d.moved < CLICK_SLOP_PX && state.enabled) setPanel((p) => !p)
  }

  const respond = (choice: 'accept' | 'dismiss' | 'snooze') => {
    if (offer) void window.pai.respondOffer(offer.id, choice)
    setOffer(null)
  }

  // Live suggestions for the task being typed (or ideas when the box is empty), while the panel is open.
  useEffect(() => {
    if (!panel || !state.enabled) return setSuggestions([])
    let stale = false
    const t = setTimeout(async () => {
      const res = await window.pai.suggest(draft)
      if (!stale && res.ok) setSuggestions(res.value.slice(0, MAX_MINI_SUGGESTIONS))
    }, 120)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [draft, panel, state.enabled, tasks.length])

  async function start(text = draft) {
    const prompt = text.trim()
    if (!prompt) return
    setError(null)
    const res = await window.pai.startTask(prompt, 'orb')
    if (res.ok) setDraft('')
    else setError(res.error)
    inputRef.current?.focus()
  }

  /** Tab takes the first suggestion. */
  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && !e.shiftKey && suggestions.length && draft.trim()) {
      e.preventDefault()
      setDraft(suggestions[0].text)
    }
  }

  const active = tasks.filter(isActiveTask)
  const recent = tasks.filter((t) => !isActiveTask(t)).slice(0, Math.max(0, 3 - active.length))
  const needsYou = active.some((t) => t.status === 'needs-you')

  const voiceView = voiceCard && (
    <div className={`voice-card voice-${voice.state}`} role="status" aria-live="polite">
      {voice.state !== 'idle' && <div className="voice-state">{VOICE_LABEL[voice.state]}</div>}
      {voice.caption && <p className="offer-text">{voice.state === 'review' ? `“${voice.caption}”` : voice.caption}</p>}
      {voice.state === 'review' ? (
        <>
          <div className="review-bar" key={voice.caption} aria-hidden />
          <div className="offer-actions">
            <button className="btn-primary btn-inline btn-sm" onClick={() => window.pai.voiceReview('send')}>
              Send now
            </button>
            <button className="btn-ghost btn-sm" onClick={() => window.pai.voiceReview('edit')}>
              Edit
            </button>
            <button className="btn-ghost btn-sm" onClick={() => window.pai.toggleVoice()}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        voice.state !== 'idle' && (
          <div className="offer-actions">
            <button className="btn-ghost btn-sm" onClick={() => window.pai.toggleVoice()}>
              {voice.state === 'speaking' ? 'Skip' : 'Stop'}
            </button>
          </div>
        )
      )}
    </div>
  )

  const offerView = offer && (
    <div className="offer-inner" role="dialog" aria-label="Suggestion">
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
  )

  const reminderView = reminder && (
    <div className="reminder-card" role="alert">
      <div className="reminder-kicker">⏰ Reminder{reminders.length > 1 ? ` · ${reminders.length}` : ''}</div>
      <p className="reminder-text">{reminder.message}</p>
      <div className="offer-actions">
        <button className="btn-primary btn-inline btn-sm" onClick={() => closeReminder(false)}>
          Done
        </button>
        <button className="btn-ghost btn-sm" onClick={() => closeReminder(true)}>
          Snooze 10 min
        </button>
      </div>
    </div>
  )

  return (
    <div className={`float-root ${panel ? 'float-root-panel' : ''}`}>
      {panel ? (
        <section className="mini-eco glass" aria-label="Mini Ecospace">
          <header className="mini-head">
            <span className="mini-brand">✦ Ecospace</span>
            <button className="link-btn" onClick={() => window.pai.openEcospace()}>
              Open full ↗
            </button>
            <button className="icon-mini" onClick={() => setPanel(false)} aria-label="Close">
              ×
            </button>
          </header>
          {reminderView}
          {voiceView}
          {!voiceCard && offerView}
          <form
            className="mini-box"
            onSubmit={(e) => {
              e.preventDefault()
              void start()
            }}
          >
            <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} placeholder="What needs doing?" aria-label="New task" />
            <button type="button" className={`icon-btn mic ${voice.state !== 'idle' ? 'mic-on' : ''}`} onClick={() => window.pai.toggleVoice()} aria-label="Say a task" title="Say a task">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <button className="send" type="submit" disabled={!draft.trim()} aria-label="Start task">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
          {suggestions.length > 0 && (
            <div className="mini-ideas" aria-label="Suggestions">
              {suggestions.map((s) => (
                <button key={s.text} className="chip-suggestion" title={s.text} onClick={() => (s.send ? start(s.text) : setDraft(s.text))}>
                  <span className="chip-text">{s.label}</span>
                  {!s.send && <span className="chip-edit">✎</span>}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mini-error">{error}</p>}
          <div className="mini-list">
            {active.length === 0 && recent.length === 0 && <p className="mini-empty">Type or say a task. It runs in the background and shows here.</p>}
            {[...active, ...recent].map((t) => (
              <TaskCard key={t.id} task={t} compact />
            ))}
          </div>
        </section>
      ) : (
        (reminder || voiceCard || offer) && (
          <div className={`offer glass ${reminder ? 'offer-reminder' : ''}`}>{reminder ? reminderView : voiceCard ? voiceView : offerView}</div>
        )
      )}
      <button
        className={`float-orb ${state.enabled ? '' : 'float-off'} ${state.quietMode ? 'float-quiet' : ''} ${offer || needsYou ? 'float-alert' : ''} float-${voice.state} ${active.length ? 'float-working' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onContextMenu={(e) => {
          e.preventDefault()
          void window.pai.showFloatMenu()
        }}
        title={state.enabled ? 'Click: mini Ecospace · ⌘⇧Space: talk · Drag: move · Right-click: menu' : 'Assistant is OFF · Right-click: menu'}
        aria-label="Open mini Ecospace"
      >
        <span className="orb-ring" />
        <span className="orb-ring orb-ring-2" />
        <span className="orb-core" />
        {active.length > 0 && <span className="orb-count">{active.length}</span>}
      </button>
    </div>
  )
}
