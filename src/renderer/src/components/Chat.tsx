/**
 * Chat screen: message list + composer.
 *
 * The conversation lives in React state. Each send passes the visible
 * history to main, which validates it, runs the model and any tools
 * (asking permission), and returns the answer plus the tool steps.
 * Replies stream in as the model writes them, and are rendered as plain
 * text (never HTML) so model output cannot inject markup into the app.
 *
 * Voice: while the mic button is on, what you say appears LIVE in the message
 * box (transcribed locally by Whisper) and you can edit it at any time. When you
 * stop, the text stays in the box so you can check it; Enter sends.
 * The speaker toggle reads replies aloud with the OS voices.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Dictation } from '@shared/dictation'
import { CHAT_LIMITS, type ChatTurn, type StoredMessage, type Suggestion, type ToolStep } from '@shared/ipc'
import { History } from './History'
import { MAX_RECORD_SECONDS, Recorder, speak, stopSpeaking } from '../audio'
import { usePaiEvent } from '../hooks'
import { handsFree } from '../voice/handsFree'
import { Orb } from './Orb'
import { RichText } from './RichText'
import { LiveStep, StepRow, WorkingLine } from './Activity'
import { toolLabel } from '../toolLabels'

interface Message extends ChatTurn {
  id: number
  /** When it was sent/received (saved with the chat). */
  at?: string
  steps?: ToolStep[]
  /** Set when this request was stopped or failed. It is never sent to the model again (unless retried). */
  failed?: 'stopped' | 'error'
}

const toStored = (m: Message): StoredMessage => ({
  role: m.role,
  content: m.content,
  at: m.at ?? new Date().toISOString(),
  ...(m.steps?.length ? { steps: m.steps } : {}),
  ...(m.failed ? { failed: m.failed } : {})
})

function loadHistoryOpen(): boolean {
  try {
    return localStorage.getItem('pai.historyOpen') !== 'off'
  } catch {
    return true
  }
}

/** What the model gets: everything except stopped/failed requests. */
const forModel = (history: Message[]): ChatTurn[] => history.filter((m) => !m.failed).map(({ role, content }) => ({ role, content }))

const LIVE_CAPTION_EVERY_MS = 2500
const SUGGEST_DEBOUNCE_MS = 120

let nextId = 1

type Voice = { state: 'idle' } | { state: 'recording'; seconds: number } | { state: 'transcribing' }

/** Remember the speaker toggle on this computer (UI preference only). */
function loadSpeakPref(): boolean {
  try {
    return localStorage.getItem('pai.speakReplies') === 'on'
  } catch {
    return false
  }
}

export function Chat({ assistantName, enabled }: { assistantName: string; enabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<{ tool: string; target: string } | null>(null)
  const [liveSteps, setLiveSteps] = useState<ToolStep[]>([])
  const [liveText, setLiveText] = useState('')
  const [voice, setVoice] = useState<Voice>({ state: 'idle' })
  const [speakOn, setSpeakOn] = useState(loadSpeakPref)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  // Saved conversation: its id (null = not saved yet) and a counter that refreshes the list.
  const [convId, setConvId] = useState<string | null>(null)
  const convIdRef = useRef<string | null>(null)
  convIdRef.current = convId
  const [historyVersion, setHistoryVersion] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(loadHistoryOpen)
  const dictation = useRef(new Dictation()).current
  const recorderRef = useRef<Recorder | null>(null)
  const composerRef = useRef<HTMLFormElement>(null)
  /** Mic loudness goes straight to a CSS variable (no React re-render 60x a second). */
  const setLevel = (level: number) => composerRef.current?.style.setProperty('--level', level.toFixed(2))
  const speakRef = useRef(speakOn)
  speakRef.current = speakOn
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const draftRef = useRef(draft)
  draftRef.current = draft
  const busyRef = useRef(false)
  const [busySince, setBusySince] = useState(0)

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, error, liveSteps, live, liveText])

  // Grow the textarea with its content (up to a limit set in CSS).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // Live progress while tools run.
  usePaiEvent('agent:event', (e) => {
    if (e.kind === 'text') setLiveText((t) => t + e.delta)
    else if (e.kind === 'text-reset') setLiveText('')
    else if (e.kind === 'tool-start') {
      setLiveText('')
      setLive({ tool: e.tool, target: e.target })
    } else {
      setLive(null)
      setLiveSteps((s) => [...s, e.step])
    }
  })

  // Live suggestions for what you are typing (or, while recording, saying).
  const suggestFor = draft
  useEffect(() => {
    if (!enabled || busy) return setSuggestions([])
    let stale = false
    const t = setTimeout(async () => {
      const res = await window.pai.suggest(suggestFor)
      if (!stale && res.ok) setSuggestions(res.value)
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [suggestFor, enabled, busy, messages.length])

  // Live transcript while recording: what you said so far appears in the box every few seconds.
  useEffect(() => {
    if (voice.state !== 'recording') return
    let pending = false
    let stopped = false
    const t = setInterval(async () => {
      const rec = recorderRef.current
      if (pending || !rec) return
      pending = true
      const ticket = dictation.ticket()
      const audio = await rec.snapshot()
      const segment = audio ? dictation.segment(audio) : null
      // Long dictations: only re-transcribe the last 30 s each time, to stay fast.
      const res = segment && segment.length > 8000 ? await window.pai.transcribe(segment.slice(-30 * 16_000)) : null
      if (!stopped && res?.ok) {
        const text = dictation.compose(res.value, ticket)
        if (text !== null && recorderRef.current) setDraft(text)
      }
      pending = false
    }, LIVE_CAPTION_EVERY_MS)
    return () => {
      stopped = true
      clearInterval(t)
    }
  }, [voice.state])

  // Save every detail of the chat after each change (not while a reply is still being written).
  useEffect(() => {
    if (busy || messages.length === 0) return
    const t = setTimeout(async () => {
      const res = await window.pai.saveConversation(convIdRef.current, messages.map(toStored))
      if (res.ok) {
        if (convIdRef.current !== res.value.id) setConvId(res.value.id)
        setHistoryVersion((v) => v + 1)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [messages, busy])

  function newChat() {
    if (busyRef.current) return
    recorderRef.current?.cancel()
    recorderRef.current = null
    stopSpeaking()
    setMessages([])
    setConvId(null)
    setDraft('')
    setError(null)
    setVoice({ state: 'idle' })
    inputRef.current?.focus()
  }

  async function openChat(id: string) {
    if (busyRef.current || id === convIdRef.current) return
    const res = await window.pai.getConversation(id)
    if (!res.ok) return setError(res.error)
    stopSpeaking()
    setMessages(res.value.messages.map((m) => ({ ...m, id: nextId++ })))
    setConvId(id)
    setError(null)
    setDraft('')
  }

  function toggleHistory() {
    const next = !historyOpen
    setHistoryOpen(next)
    try {
      localStorage.setItem('pai.historyOpen', next ? 'on' : 'off')
    } catch {
      /* not remembered */
    }
  }

  // Esc stops the reply (unless a permission dialog is open: there Esc means "deny").
  useEffect(() => {
    if (!busy) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.overlay')) void window.pai.cancelChat()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy])

  // Stop the mic and any speech when this screen goes away.
  useEffect(() => () => {
    recorderRef.current?.cancel()
    stopSpeaking()
  }, [])

  // Recording timer; auto-stops long recordings.
  useEffect(() => {
    if (voice.state !== 'recording') return
    const started = Date.now()
    const t = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000)
      if (seconds >= MAX_RECORD_SECONDS) void stopRecording()
      else setVoice((v) => (v.state === 'recording' && v.seconds !== seconds ? { state: 'recording', seconds } : v))
    }, 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state])

  // Main asks us to send a message (an accepted proactive offer).
  usePaiEvent('chat:prefill', ({ text }) => send(text))

  /** Ask main for a reply. Resolves with the reply text, or null if it failed/was stopped. */
  async function requestReply(history: Message[]): Promise<string | null> {
    busyRef.current = true
    setBusySince(Date.now())
    setBusy(true)
    setError(null)
    setLiveSteps([])
    setLiveText('')
    stopSpeaking()
    const res = await window.pai.sendChat(forModel(history))
    busyRef.current = false
    setBusy(false)
    setLive(null)
    setLiveSteps([])
    setLiveText('')
    if (res.ok) {
      setMessages([...history, { id: nextId++, role: 'assistant', content: res.value.text, steps: res.value.steps, at: new Date().toISOString() }])
      // Hands-free speaks its own replies; otherwise use the speaker toggle.
      if (speakRef.current && !handsFree.active) speak(res.value.text)
      inputRef.current?.focus()
      return res.value.text
    } else {
      // Mark the request so it is not repeated with the next message.
      const failed = res.error === 'Stopped.' ? 'stopped' : 'error'
      setMessages(history.map((m, i) => (i === history.length - 1 && m.role === 'user' ? { ...m, failed } : m)))
      setError(failed === 'stopped' ? null : res.error)
    }
    inputRef.current?.focus()
    return null
  }

  function send(text: string): Promise<string | null> {
    const content = text.trim()
    if (!content || busyRef.current) return Promise.resolve(null)
    const history = [...messagesRef.current, { id: nextId++, role: 'user' as const, content, at: new Date().toISOString() }]
    setMessages(history)
    setDraft('')
    return requestReply(history)
  }



  async function startRecording() {
    if (busy || voice.state !== 'idle') return
    setError(null)
    stopSpeaking()
    const mic = await window.pai.requestMic()
    if (!mic.ok || !mic.value) {
      setError('Microphone access is off. Allow it in System Settings → Privacy & Security → Microphone.')
      return
    }
    void window.pai.warmUpSpeech() // load the model while you talk
    const rec = new Recorder()
    try {
      await rec.start(setLevel)
    } catch {
      setError("Couldn't start the microphone. Is one connected?")
      return
    }
    recorderRef.current = rec
    dictation.start(draftRef.current)
    setVoice({ state: 'recording', seconds: 0 })
    inputRef.current?.focus()
  }

  /**
   * Stop the mic and put the final transcript in the box.
   * With `thenSend`, send it right away (Enter / Send while recording).
   */
  async function stopRecording(thenSend = false) {
    const rec = recorderRef.current
    recorderRef.current = null
    if (!rec) return
    setVoice({ state: 'transcribing' })
    setLevel(0)
    let text = draftRef.current
    try {
      const ticket = dictation.ticket()
      const segment = dictation.segment(await rec.stop())
      if (segment.length > 8000) {
        const res = await window.pai.transcribe(segment)
        const composed = res.ok ? dictation.compose(res.value, ticket) : null
        if (composed !== null) text = composed
      }
    } catch {
      setError('Recording failed. Your text so far is kept.')
    } finally {
      setVoice({ state: 'idle' })
    }
    setDraft(text)
    if (thenSend) void send(text)
    else
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.setSelectionRange(text.length, text.length)
      })
  }

  function toggleSpeak() {
    const next = !speakOn
    setSpeakOn(next)
    if (!next) stopSpeaking()
    try {
      localStorage.setItem('pai.speakReplies', next ? 'on' : 'off')
    } catch {
      /* preference just won't be remembered */
    }
  }

  /** Send the last failed request again. */
  function retry() {
    const last = messagesRef.current.at(-1)
    if (!last?.failed || busy) return
    const history = [...messagesRef.current.slice(0, -1), { ...last, failed: undefined }]
    setMessages(history)
    void requestReply(history)
  }

  /** Use a suggestion: send it, or put it in the box to finish typing. */
  function applySuggestion(s: Suggestion) {
    if (voice.state === 'recording') {
      recorderRef.current?.cancel()
      recorderRef.current = null
      setVoice({ state: 'idle' })
    }
    if (s.send) send(s.text)
    else {
      setDraft(s.text)
      requestAnimationFrame(() => {
        const el = inputRef.current
        el?.focus()
        el?.setSelectionRange(s.text.length, s.text.length)
      })
    }
  }

  /** Enter sends, Shift+Enter adds a new line, Tab takes the first suggestion. */
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab' && !e.shiftKey && suggestions.length && draft.trim()) {
      e.preventDefault()
      applySuggestion({ ...suggestions[0], send: false })
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (voice.state === 'recording') void stopRecording(true)
      else void send(draft)
    }
  }

  const tooLong = draft.length > CHAT_LIMITS.maxMessageChars
  const empty = messages.length === 0

  return (
    <div className="chat-wrap">
      {historyOpen && (
        <History
          currentId={convId}
          version={historyVersion}
          onOpen={openChat}
          onNew={newChat}
          onDeleted={(id) => id === convIdRef.current && newChat()}
        />
      )}
    <main className="chat">
      <div className="chat-toolbar">
        <button className="icon-mini" onClick={toggleHistory} title={historyOpen ? 'Hide chats' : 'Show chats'} aria-pressed={historyOpen}>
          ☰
        </button>
        {!historyOpen && (
          <button className="link-btn" onClick={newChat}>
            + New chat
          </button>
        )}
      </div>
      <div className="chat-list" ref={listRef} aria-live="polite">
        {empty && (
          <div className="chat-empty">
            <Orb busy={busy} />
            <h1 className="headline">How can I help?</h1>
            <p className="sub">Private · local · asks before acting</p>
            {!draft.trim() && (
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s.text} className="suggestion glass" onClick={() => applySuggestion(s)} disabled={!enabled}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role} ${m.failed ? 'msg-failed' : ''}`}>
            {m.role === 'assistant' && <span className="avatar" aria-hidden />}
            <div className="msg-body">
              {m.steps && m.steps.length > 0 && (
                <div className="acts">
                  {m.steps.map((s, i) => (
                    <StepRow key={i} step={s} />
                  ))}
                </div>
              )}
              <div className="bubble">{m.role === 'assistant' ? <RichText text={m.content} /> : m.content}</div>
              {m.failed && (
                <div className="msg-note">
                  {m.failed === 'stopped' ? 'Stopped · not sent again' : 'Failed · not sent again'}
                  {m === messages.at(-1) && enabled && !busy && (
                    <button className="link-btn" onClick={retry}>
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg msg-assistant">
            <span className="avatar avatar-busy" aria-hidden />
            <div className="msg-body">
              {(liveSteps.length > 0 || live) && (
                <div className="acts">
                  {liveSteps.map((s, i) => (
                    <StepRow key={i} step={s} />
                  ))}
                  {live && <LiveStep tool={live.tool} target={live.target} />}
                </div>
              )}
              {liveText && !live && (
                <div className="bubble streaming">
                  <RichText text={liveText} />
                </div>
              )}
              <WorkingLine since={busySince} onStop={() => window.pai.cancelChat()} label={live ? toolLabel(live.tool, 'doing') : undefined} />
            </div>
          </div>
        )}

        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            {enabled && (
              <button className="btn-ghost" onClick={retry}>
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live suggestions (hidden on the empty screen, which shows its own). */}
      {suggestions.length > 0 && !busy && (!empty || draft.trim() || voice.state === 'recording') && (
        <div className="live-suggestions" aria-label="Suggestions">
          <span className="live-icon" aria-hidden>
            ✦
          </span>
          {suggestions.map((s, i) => (
            <button key={s.text} className="chip-suggestion" onClick={() => applySuggestion(s)} title={s.text}>
              <span className="chip-text">{s.label}</span>
              {i === 0 && draft.trim() && <kbd>Tab</kbd>}
              {!s.send && <span className="chip-edit">✎</span>}
            </button>
          ))}
        </div>
      )}

      <form
        ref={composerRef}
        className={`composer glass ${voice.state === 'recording' ? 'composer-recording' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          if (voice.state === 'recording') void stopRecording(true)
          else void send(draft)
        }}
      >
        <button
          type="button"
          className={`icon-btn mic ${voice.state === 'recording' ? 'mic-on' : ''}`}
          onClick={() => (voice.state === 'recording' ? stopRecording() : startRecording())}
          disabled={!enabled || busy || voice.state === 'transcribing'}
          aria-label={voice.state === 'recording' ? 'Stop the microphone' : 'Speak a message'}
          title={voice.state === 'recording' ? 'Stop the mic (your text stays in the box)' : 'Speak (transcribed live on this computer)'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {voice.state === 'recording' && (
          <div className="rec-pill" aria-live="polite" title="Listening — your words appear in the box">
            <span className="wave">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} style={{ animationDelay: `${i * 90}ms` }} />
              ))}
            </span>
            {voice.seconds}s
          </div>
        )}
        {voice.state === 'transcribing' && (
          <div className="rec-pill">
            <span className="spinner" aria-hidden />
          </div>
        )}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (voice.state === 'recording') dictation.userChanged(e.target.value)
          }}
          onKeyDown={onKeyDown}
          placeholder={
            !enabled ? `${assistantName} is off` : voice.state === 'recording' ? 'Listening… your words will appear here' : `Message ${assistantName}…`
          }
          disabled={!enabled}
          rows={1}
          autoFocus
          aria-label="Message"
        />
        <button
          type="button"
          className={`icon-btn ${speakOn ? 'speak-on' : ''}`}
          onClick={toggleSpeak}
          aria-pressed={speakOn}
          aria-label="Read replies aloud"
          title={speakOn ? 'Spoken replies: on' : 'Spoken replies: off'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {speakOn ? (
              <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        {busy ? (
          <button className="send send-stop" type="button" onClick={() => window.pai.cancelChat()} aria-label="Stop">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
              <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button className="send" type="submit" disabled={!enabled || (!draft.trim() && voice.state !== 'recording') || tooLong} aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
      <p className="composer-hint">
        {tooLong
          ? `Too long: ${draft.length}/${CHAT_LIMITS.maxMessageChars} characters`
          : voice.state === 'recording'
            ? 'Mic on · fix any word as you go · 🎤 stops (text stays) · Enter sends'
            : 'Enter to send · Shift+Enter for a new line · Tab takes a suggestion'}
      </p>
    </main>
    </div>
  )
}
