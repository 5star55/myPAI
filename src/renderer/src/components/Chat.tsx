/**
 * Chat screen: message list + composer.
 *
 * The conversation lives in React state. Each send passes the visible
 * history to main, which validates it, runs the model and any tools
 * (asking permission), and returns the answer plus the tool steps.
 * Replies are rendered as plain text (never HTML) so model output
 * cannot inject markup into the app.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CHAT_LIMITS, type ChatTurn, type ToolStep } from '@shared/ipc'
import { usePaiEvent } from '../hooks'
import { Orb } from './Orb'

interface Message extends ChatTurn {
  id: number
  steps?: ToolStep[]
}

const SUGGESTIONS = ['What can you do?', 'List files in ~/Downloads', 'Remind me to stretch in 2 minutes', 'Remember that I like green tea']

const STATUS_ICON: Record<ToolStep['status'], string> = { ok: '✓', denied: '✕', error: '!', blocked: '⦸' }

let nextId = 1

export function Chat({ assistantName, enabled }: { assistantName: string; enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<{ tool: string; target: string } | null>(null)
  const [liveSteps, setLiveSteps] = useState<ToolStep[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, error, liveSteps, live])

  // Grow the textarea with its content (up to a limit set in CSS).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // Live progress while tools run.
  usePaiEvent('agent:event', (e) => {
    if (e.kind === 'tool-start') setLive({ tool: e.tool, target: e.target })
    else {
      setLive(null)
      setLiveSteps((s) => [...s, e.step])
    }
  })

  // Main asks us to send a message (an accepted proactive offer).
  usePaiEvent('chat:prefill', ({ text }) => send(text))

  async function requestReply(history: Message[]) {
    setBusy(true)
    setError(null)
    setLiveSteps([])
    const res = await window.pai.sendChat(history.map(({ role, content }) => ({ role, content })))
    setBusy(false)
    setLive(null)
    setLiveSteps([])
    if (res.ok) setMessages([...history, { id: nextId++, role: 'assistant', content: res.value.text, steps: res.value.steps }])
    else setError(res.error)
    inputRef.current?.focus()
  }

  function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    const history = [...messagesRef.current, { id: nextId++, role: 'user' as const, content }]
    setMessages(history)
    setDraft('')
    void requestReply(history)
  }

  /** Enter sends, Shift+Enter adds a new line. */
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send(draft)
    }
  }

  const tooLong = draft.length > CHAT_LIMITS.maxMessageChars
  const empty = messages.length === 0

  return (
    <main className="chat">
      <div className="chat-list" ref={listRef} aria-live="polite">
        {empty && (
          <div className="chat-empty">
            <Orb busy={busy} />
            <h1 className="headline">How can I help?</h1>
            <p className="sub">Private · local · asks before acting</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggestion glass" onClick={() => send(s)} disabled={!enabled}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            {m.role === 'assistant' && <span className="avatar" aria-hidden />}
            <div className="msg-body">
              {m.steps && m.steps.length > 0 && <Steps steps={m.steps} />}
              <div className="bubble">{m.content}</div>
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg msg-assistant">
            <span className="avatar avatar-busy" aria-hidden />
            <div className="msg-body">
              {liveSteps.length > 0 && <Steps steps={liveSteps} />}
              {live ? (
                <div className="step step-live">
                  <span className="spinner" aria-hidden /> {live.tool} · <span className="step-target">{live.target}</span>
                </div>
              ) : (
                <div className="bubble typing" aria-label={`${assistantName} is thinking`}>
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            {enabled && (
              <button className="btn-ghost" onClick={() => requestReply(messages)}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <form
        className="composer glass"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={enabled ? `Message ${assistantName}…` : `${assistantName} is off`}
          disabled={!enabled}
          rows={1}
          autoFocus
          aria-label="Message"
        />
        {busy ? (
          <button className="send send-stop" type="button" onClick={() => window.pai.cancelChat()} aria-label="Stop">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
              <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button className="send" type="submit" disabled={!enabled || !draft.trim() || tooLong} aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
      <p className="composer-hint">
        {tooLong
          ? `Too long: ${draft.length}/${CHAT_LIMITS.maxMessageChars} characters`
          : 'Enter to send · Shift+Enter for a new line'}
      </p>
    </main>
  )
}

function Steps({ steps }: { steps: ToolStep[] }) {
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={i} className={`step step-${s.status}`} title={s.summary}>
          <span className="step-icon">{STATUS_ICON[s.status]}</span>
          {s.tool} · <span className="step-target">{s.target}</span>
          {s.status !== 'ok' && <span className="step-why">{s.summary}</span>}
        </div>
      ))}
    </div>
  )
}
