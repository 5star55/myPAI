/**
 * TaskCard — one Ecospace task: status, live steps, result, and controls.
 * `compact` is the version shown in the orb's mini Ecospace.
 * A finished task has a reply box: answer its question (or ask for more) and it carries on.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Task } from '@shared/ipc'
import { elapsed, isActiveTask } from '../tasks'
import { toolLabel } from '../toolLabels'
import { CopyButton, LiveStep, StepList, StepRow } from './Activity'
import { MiniOrb } from './MiniOrb'
import { RichText } from './RichText'

const STATUS_LABEL: Record<Task['status'], string> = {
  queued: 'Queued',
  running: 'Working',
  'needs-you': 'Needs you',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped'
}

/** Re-render every `ms` while `on` (for timers and spinners). */
function useTick(on: boolean, ms: number): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setN((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [on, ms])
  return n
}

export function TaskCard({ task, compact = false, defaultOpen }: { task: Task; compact?: boolean; defaultOpen?: boolean }) {
  const active = isActiveTask(task)
  useTick(active, 1000) // keeps the timer ticking
  const [open, setOpen] = useState(defaultOpen ?? active)
  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  const [reply, setReply] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)
  // The task ended by asking you something: highlight the reply box.
  const asksYou = task.status === 'done' && /\?\s*$/.test(task.result ?? '')
  // Earlier rounds of the conversation (everything except the first prompt and the latest answer).
  const turns = task.turns ?? []
  const earlier = turns.slice(1, turns.at(-1)?.role === 'assistant' && turns.at(-1)?.content === task.result ? -1 : undefined)

  async function sendReply() {
    const text = reply.trim()
    if (!text) return
    const res = await window.pai.replyToTask(task.id, text)
    if (res.ok) {
      setReply('')
      setReplyError(null)
      setOpen(true)
    } else setReplyError(res.error)
  }
  function onReplyKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void sendReply()
    }
  }

  const time = elapsed(task.startedAt ?? task.createdAt, active ? undefined : task.finishedAt)
  const glyph = task.status === 'running' ? <MiniOrb /> : task.status === 'needs-you' ? '!' : task.status === 'queued' ? '◌' : task.status === 'done' ? '✓' : '✕'
  const doing = task.live ? toolLabel(task.live.tool, 'doing') : task.partial ? 'Writing' : 'Thinking'

  return (
    <article className={`task glass task-${task.status} ${compact ? 'task-compact' : ''}`}>
      <header className="task-head" onClick={() => !compact && setOpen(!open)}>
        <span className="task-glyph" aria-hidden>
          {glyph}
        </span>
        <span className="task-title" title={task.prompt}>
          {task.title}
        </span>
        <span className={`task-badge badge-${asksYou ? 'needs-you' : task.status}`}>{task.status === 'running' ? `${doing}…` : asksYou ? 'Asked you' : STATUS_LABEL[task.status]}</span>
        <span className="task-time">{time}</span>
      </header>

      {!open && !compact && !active && (task.result || task.error) && (
        <p className="task-preview" onClick={() => setOpen(true)}>
          {(task.result ?? task.error ?? '').replace(/^\(mock\)\s*/i, '').replace(/\s+/g, ' ').slice(0, 180)}
        </p>
      )}

      {open && !compact && (
        <div className="task-body">
          {earlier.length > 0 && (
            <div className="task-thread">
              {earlier.map((t, i) =>
                t.role === 'user' ? (
                  <div key={i} className="task-you">
                    <span className="task-you-label">You</span> {t.content}
                  </div>
                ) : (
                  <div key={i} className="task-result task-earlier">
                    <RichText text={t.content} />
                  </div>
                )
              )}
            </div>
          )}
          {/* While it works you see every step; once finished, long lists fold into one line. */}
          {active ? (
            task.steps.length > 0 && (
              <div className="acts">
                {task.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </div>
            )
          ) : (
            <StepList steps={task.steps} />
          )}
          {task.live && <LiveStep tool={task.live.tool} target={task.live.target} />}
          {task.status === 'needs-you' && <div className="task-needs">Waiting for your OK in the permission dialog.</div>}
          {task.partial && active && (
            <div className="task-result streaming">
              <RichText text={task.partial} />
            </div>
          )}
          {task.result && (
            <div className="task-result">
              <RichText text={task.result} />
              {!active && (
                <div className="msg-actions task-result-actions">
                  <CopyButton text={task.result} />
                </div>
              )}
            </div>
          )}
          {task.error && <div className="task-error">{task.error}</div>}
        </div>
      )}

      {!compact && !active && (open || asksYou) && (
        <div className={`task-reply ${asksYou ? 'task-reply-ask' : ''}`}>
          <textarea
            ref={replyRef}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={onReplyKey}
            rows={1}
            placeholder={asksYou ? 'Answer to continue…' : 'Reply to continue this task…'}
            aria-label={`Reply to ${task.title}`}
          />
          <button className="send" onClick={() => void sendReply()} disabled={!reply.trim()} aria-label="Send reply">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
      {replyError && <div className="task-error">{replyError}</div>}

      {compact && active && task.live && (
        <div className="task-mini-step">
          ⏺ {toolLabel(task.live.tool, 'doing')}
        </div>
      )}
      {compact && !active && task.result && <div className="task-mini-result">{task.result.replace(/\s+/g, ' ').slice(0, 140)}</div>}
      {compact && asksYou && (
        <button className="link-btn task-mini-answer" onClick={() => window.pai.openEcospace()}>
          Answer in Ecospace ↗
        </button>
      )}

      {!compact && (
        <footer className="task-actions">
          {active ? (
            <button className="link-btn danger" onClick={() => window.pai.stopTask(task.id)}>
              Stop
            </button>
          ) : (
            <>
              <button className="link-btn" onClick={() => window.pai.retryTask(task.id)}>
                Run again
              </button>
              <button className="link-btn" onClick={() => setOpen(!open)}>
                {open ? 'Hide details' : 'Show details'}
              </button>
              <button className="link-btn muted-link" onClick={() => window.pai.deleteTask(task.id)}>
                Remove
              </button>
            </>
          )}
        </footer>
      )}
      {compact && active && (
        <button className="link-btn danger task-mini-stop" onClick={() => window.pai.stopTask(task.id)}>
          Stop
        </button>
      )}
    </article>
  )
}
