/**
 * TaskCard — one Ecospace task: status, live steps, result, and controls.
 * `compact` is the version shown in the orb's mini Ecospace.
 */
import { useEffect, useState } from 'react'
import type { Task } from '@shared/ipc'
import { elapsed, isActiveTask } from '../tasks'
import { toolLabel } from '../toolLabels'
import { LiveStep, StepRow } from './Activity'
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
        <span className={`task-badge badge-${task.status}`}>{task.status === 'running' ? `${doing}…` : STATUS_LABEL[task.status]}</span>
        <span className="task-time">{time}</span>
      </header>

      {!open && !compact && !active && (task.result || task.error) && (
        <p className="task-preview" onClick={() => setOpen(true)}>
          {(task.result ?? task.error ?? '').replace(/^\(mock\)\s*/i, '').replace(/\s+/g, ' ').slice(0, 180)}
        </p>
      )}

      {open && !compact && (
        <div className="task-body">
          {task.steps.length > 0 && (
            <div className="acts">
              {task.steps.map((s, i) => (
                <StepRow key={i} step={s} />
              ))}
            </div>
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
            </div>
          )}
          {task.error && <div className="task-error">{task.error}</div>}
        </div>
      )}

      {compact && active && task.live && (
        <div className="task-mini-step">
          ⏺ {toolLabel(task.live.tool, 'doing')}
        </div>
      )}
      {compact && !active && task.result && <div className="task-mini-result">{task.result.replace(/\s+/g, ' ').slice(0, 140)}</div>}

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
