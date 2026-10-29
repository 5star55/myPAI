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
import { THINKING_WORDS, summarizeSteps, toolDetail, toolLabel } from '../toolLabels'
import { MiniOrb } from './MiniOrb'
import { RichText } from './RichText'
import { WebResults } from './WebResults'

const PREVIEW_LINES = 4

const STATUS_NOTE: Record<ToolStep['status'], string> = { ok: '', denied: 'Denied', error: 'Failed', blocked: 'Not allowed' }

/** One finished step. A "note" is what the assistant said between steps. */
export function StepRow({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false)
  if (step.tool === 'note') {
    return (
      <div className="act-say">
        <RichText text={step.summary} />
      </div>
    )
  }
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
      {step.data?.kind === 'preview' && <PreviewLink url={step.data.url} />}
    </div>
  )
}

/** "Open preview ↗" under a step that started a server or looked at a page. */
function PreviewLink({ url }: { url: string }) {
  const [error, setError] = useState<string | null>(null)
  async function open() {
    const res = await window.pai.openPreview(url)
    setError(res.ok ? null : res.error)
  }
  return (
    <button className="preview-link" onClick={() => void open()} title={error ?? `Show ${url} in the preview`}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="2" />
      </svg>
      Open preview
      <span className="preview-url">{url.replace(/^https?:\/\//, '')}</span>
    </button>
  )
}

/**
 * A finished run's steps, folded into one line ("Searched the web, read 2 files ▸")
 * so the answer stays in view. Problems (denied, failed) are counted in the line.
 */
export function StepList({ steps }: { steps: ToolStep[] }) {
  const [open, setOpen] = useState(false)
  if (steps.length === 0) return null
  const problems = steps.filter((s) => s.status !== 'ok').length
  const summary = summarizeSteps(steps)
  // Previews stay one click away even while folded.
  const preview = [...steps].reverse().find((s) => s.data?.kind === 'preview')?.data
  if (!summary || open) {
    return (
      <div className="acts">
        {steps.map((s, i) => (
          <StepRow key={i} step={s} />
        ))}
        {open && (
          <button className="link-btn act-more act-fold" onClick={() => setOpen(false)}>
            Hide steps
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="acts-folded">
      <button className="acts-summary" onClick={() => setOpen(true)} aria-expanded={false}>
        {summary}
        {problems ? <span className="acts-problems"> · {problems} didn't go through</span> : null}
        <span className="acts-chevron" aria-hidden>
          ▸
        </span>
      </button>
      {preview?.kind === 'preview' && <PreviewLink url={preview.url} />}
    </div>
  )
}

/** Copy text to the clipboard, with a short "Copied" confirmation. */
export function CopyButton({ text, className = '', icon = false }: { text: string; className?: string; icon?: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable: the text can still be selected */
    }
  }
  return (
    <button type="button" className={`msg-action ${icon ? 'msg-icon' : ''} ${className}`} onClick={() => void copy()} title={copied ? 'Copied' : 'Copy'} aria-label="Copy">
      {icon ? (
        copied ? (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )
      ) : copied ? (
        '✓ Copied'
      ) : (
        'Copy'
      )}
    </button>
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
