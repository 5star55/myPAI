/**
 * Ecospace — the home screen, built for getting things done.
 *
 * Give a task (type, pick a suggestion, or talk), and it runs in the
 * background as a task card with live steps. Up to 3 run at once; the rest
 * queue. Finished tasks stay below, saved, so you can check or re-run them.
 * The floating orb is a mini version of this screen.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Profile, Suggestion, VoiceStatus } from '@shared/ipc'
import { Orb } from '../components/Orb'
import { TaskCard } from '../components/TaskCard'
import { isActiveTask, useTasks } from '../tasks'
import { handsFree } from '../voice/handsFree'

const ORDER: Record<string, number> = { 'needs-you': 0, running: 1, queued: 2 }

function greeting(name: string): string {
  const h = new Date().getHours()
  const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}.` : `${part}.`
}

const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString()

interface Props {
  profile: Profile
  enabled: boolean
  /** Text handed over from voice "Edit". */
  incomingDraft: string | null
  onDraftTaken: () => void
}

export function Ecospace({ profile, enabled, incomingDraft, onDraftTaken }: Props) {
  const tasks = useTasks()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [voice, setVoice] = useState<VoiceStatus>({ state: 'idle' })
  const [showEarlier, setShowEarlier] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const active = tasks.filter(isActiveTask).sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))
  const finished = tasks.filter((t) => !isActiveTask(t))
  const today = finished.filter((t) => isToday(t.finishedAt ?? t.createdAt))
  const earlier = finished.filter((t) => !isToday(t.finishedAt ?? t.createdAt))

  useEffect(() => handsFree.subscribe(setVoice), [])

  // Voice "Edit" lands here.
  useEffect(() => {
    if (incomingDraft === null) return
    setDraft(incomingDraft)
    onDraftTaken()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [incomingDraft, onDraftTaken])

  // Grow the box with its content.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // Live suggestions for the task being typed (or ideas when the box is empty).
  useEffect(() => {
    if (!enabled) return setSuggestions([])
    let stale = false
    const t = setTimeout(async () => {
      const res = await window.pai.suggest(draft)
      if (!stale && res.ok) setSuggestions(res.value)
    }, 120)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [draft, enabled, tasks.length])

  async function start(text: string) {
    const prompt = text.trim()
    if (!prompt) return
    setError(null)
    const res = await window.pai.startTask(prompt, 'ecospace')
    if (res.ok) setDraft('')
    else setError(res.error)
    inputRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab' && !e.shiftKey && suggestions.length && draft.trim()) {
      e.preventDefault()
      setDraft(suggestions[0].text)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void start(draft)
    }
  }

  const listening = voice.state !== 'idle'
  const busy = active.some((t) => t.status === 'running')

  return (
    <main className="eco">
      <section className="eco-hero">
        <Orb busy={busy || listening} size={96} />
        <h1 className="eco-greet">{greeting(profile.userName)}</h1>
        <p className="eco-ask">What needs doing?</p>

        <form
          className={`eco-box glass ${listening ? 'eco-listening' : ''}`}
          onSubmit={(e) => {
            e.preventDefault()
            void start(draft)
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={!enabled ? `${profile.assistantName} is off` : listening ? voice.caption ?? 'Listening…' : 'Describe a task… e.g. “Tidy my Downloads and tell me what you moved”'}
            disabled={!enabled}
            autoFocus
            aria-label="New task"
          />
          <button
            type="button"
            className={`icon-btn mic ${listening ? 'mic-on' : ''}`}
            onClick={() => handsFree.toggle()}
            disabled={!enabled}
            title={listening ? 'Stop listening' : 'Say a task (⌘⇧Space works anywhere)'}
            aria-label="Say a task"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button className="send" type="submit" disabled={!enabled || !draft.trim()} aria-label="Start task">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
        {listening && voice.caption && <p className="eco-caption">{voice.caption}</p>}
        {error && <p className="error-box">{error}</p>}

        {suggestions.length > 0 && enabled && (
          <div className="eco-ideas">
            {suggestions.map((s) => (
              <button key={s.text} className="chip-suggestion" title={s.text} onClick={() => (s.send ? start(s.text) : setDraft(s.text))}>
                <span className="chip-text">{s.label}</span>
                {!s.send && <span className="chip-edit">✎</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="eco-tasks">
        {active.length > 0 && (
          <>
            <h2 className="eco-section">
              In progress <span className="eco-count">{active.length}</span>
            </h2>
            {active.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </>
        )}

        {today.length > 0 && (
          <>
            <h2 className="eco-section">
              Done today
              <button className="link-btn eco-clear" onClick={() => window.pai.clearFinishedTasks()}>
                Clear finished
              </button>
            </h2>
            {today.map((t) => (
              <TaskCard key={t.id} task={t} defaultOpen={false} />
            ))}
          </>
        )}

        {earlier.length > 0 && (
          <>
            <h2 className="eco-section">
              <button className="link-btn" onClick={() => setShowEarlier(!showEarlier)}>
                {showEarlier ? '▾' : '▸'} Earlier ({earlier.length})
              </button>
            </h2>
            {showEarlier && earlier.map((t) => <TaskCard key={t.id} task={t} defaultOpen={false} />)}
          </>
        )}

        {tasks.length === 0 && (
          <div className="eco-empty">
            <p>Tasks you give {profile.assistantName} show up here, with every step it takes.</p>
            <p className="muted">Several can run at once. You'll be asked before anything changes on your computer.</p>
          </div>
        )}
      </section>
    </main>
  )
}
