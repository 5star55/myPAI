/**
 * Chat screen: message list + composer.
 *
 * The conversation lives in React state for now. Each send passes the full
 * visible history to main, which validates it and calls the model.
 * Replies are rendered as plain text (never as HTML) so model output
 * cannot inject markup into the app.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CHAT_LIMITS, type ChatTurn } from '@shared/ipc'
import { Orb } from './Orb'

interface Message extends ChatTurn {
  id: number
}

const SUGGESTIONS = ['What can you do?', 'Help me plan my day', 'Explain how you keep my data private']

let nextId = 1

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, error])

  // Grow the textarea with its content (up to a limit set in CSS).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  /** Ask main for a reply to the given history. */
  async function requestReply(history: Message[]) {
    setBusy(true)
    setError(null)
    const res = await window.pai.sendChat(history.map(({ role, content }) => ({ role, content })))
    setBusy(false)
    if (res.ok) setMessages([...history, { id: nextId++, role: 'assistant', content: res.value.text }])
    else setError(res.error)
    inputRef.current?.focus()
  }

  function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    const history = [...messages, { id: nextId++, role: 'user' as const, content }]
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
                <button key={s} className="suggestion glass" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            {m.role === 'assistant' && <span className="avatar" aria-hidden />}
            <div className="bubble">{m.content}</div>
          </div>
        ))}

        {busy && (
          <div className="msg msg-assistant">
            <span className="avatar avatar-busy" aria-hidden />
            <div className="bubble typing" aria-label="pai is thinking">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            <button className="btn-ghost" onClick={() => requestReply(messages)}>
              Retry
            </button>
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
          placeholder="Message pai…"
          rows={1}
          autoFocus
          aria-label="Message"
        />
        <button className="send" type="submit" disabled={busy || !draft.trim() || tooLong} aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
      <p className="composer-hint">
        {tooLong
          ? `Too long: ${draft.length}/${CHAT_LIMITS.maxMessageChars} characters`
          : 'Enter to send · Shift+Enter for a new line'}
      </p>
    </main>
  )
}
