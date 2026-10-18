/**
 * Activity — how the assistant shows its work, step by step:
 *
 *   ⏺ Ran  ls -la
 *     ⎿  total 48
 *        drwxr-xr-x  …   (+12 lines)
 *   (◉) Pondering… (8s · esc to stop)     ← (◉) is a tiny spinning orb
 */
import { useEffect, useState } from 'react'
import type { ToolStep } from '@shared/ipc'
import { THINKING_WORDS, toolDetail, toolLabel } from '../toolLabels'
import { MiniOrb } from './MiniOrb'
import { WebResults } from './WebResults'

const PREVIEW_LINES = 4

const STATUS_NOTE: Record<ToolStep['status'], string> = { ok: '', denied: 'Denied', error: 'Failed', blocked: 'Not allowed' }

/** One finished step. */
export function StepRow({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false)
  const lines = step.output?.split('\n') ?? []
  const shown = open ? lines : lines.slice(0, PREVIEW_LINES)
  const hidden = lines.length - shown.length
  const why = step.status !== 'ok' ? step.summary : ''

  return (
    <div className={`act act-${step.status}`}>
      <div className="act-head" title={step.target}>
        <span className="act-dot" aria-hidden>
          ⏺
        </span>
        <span className="act-label">{toolLabel(step.tool, 'done')}</span>
        <code className="act-detail">{toolDetail(step.tool, step.target)}</code>
        {step.auto && <span className="act-badge">auto</span>}
        {STATUS_NOTE[step.status] && <span className="act-note">{STATUS_NOTE[step.status]}</span>}
      </div>
      {(why || lines.length > 0) && (
        <div className="act-out">
          <span className="act-elbow" aria-hidden>
            ⎿
          </span>
          <div className="act-body">
            {why && <div className="act-why">{why}</div>}
            {lines.length > 0 && <pre className="act-pre">{shown.join('\n')}</pre>}
            {(hidden > 0 || open) && lines.length > PREVIEW_LINES && (
              <button className="link-btn act-more" onClick={() => setOpen(!open)}>
                {open ? 'Show less' : `+${hidden} more line${hidden === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      )}
      {step.data?.kind === 'web' && <WebResults query={step.data.query} results={step.data.results} />}
    </div>
  )
}

/** The step that is running right now. */
export function LiveStep({ tool, target }: { tool: string; target: string }) {
  return (
    <div className="act act-live">
      <div className="act-head" title={target}>
        <span className="act-dot" aria-hidden>
          ⏺
        </span>
        <span className="act-label">{toolLabel(tool, 'doing')}</span>
        <code className="act-detail">{toolDetail(tool, target)}</code>
      </div>
    </div>
  )
}

/** "(◉) Pondering… (12s · esc to stop)" */
export function WorkingLine({ since, label, onStop }: { since: number; label?: string; onStop: () => void }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 120)
    return () => clearInterval(t)
  }, [])
  const seconds = Math.floor((Date.now() - since) / 1000)
  const word = label ?? THINKING_WORDS[Math.floor(tick / 25) % THINKING_WORDS.length]
  return (
    <div className="working" role="status" aria-live="polite">
      <MiniOrb className="working-glyph" />
      <span className="working-word">{word}…</span>
      <span className="working-meta">
        ({seconds}s ·{' '}
        <button className="link-btn" onClick={onStop}>
          esc to stop
        </button>
        )
      </span>
    </div>
  )
}
