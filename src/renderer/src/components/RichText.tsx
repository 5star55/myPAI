/** Renders an assistant reply with simple formatting. Built from parsed pieces, never raw HTML. */
import { Fragment, useState } from 'react'
import { parseBlocks, type Inline } from '@shared/markdown'
import { parsePartialQuiz, parseQuiz } from '@shared/quiz'
import { QuizCard } from './QuizCard'

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.type) {
          case 'bold':
            return <strong key={i}>{p.text}</strong>
          case 'italic':
            return <em key={i}>{p.text}</em>
          case 'code':
            return <code key={i} className="inline-code">{p.text}</code>
          case 'link':
            // Links open in your normal browser (the app window never navigates).
            return (
              <a key={i} href={p.url} target="_blank" rel="noreferrer noopener" title={p.url}>
                {p.text}
              </a>
            )
          default:
            return <Fragment key={i}>{p.text}</Fragment>
        }
      })}
    </>
  )
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable: the code can still be selected */
    }
  }
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang || 'code'}</span>
        <button type="button" className="code-copy" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  )
}

export function RichText({ text }: { text: string }) {
  return (
    <div className="rich">
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'heading') {
          return (
            <h4 key={i}>
              <InlineText parts={b.inline} />
            </h4>
          )
        }
        if (b.type === 'divider') return <hr key={i} />
        if (b.type === 'code' && b.lang === 'quiz') {
          // Still being written: the questions finished so far can already be answered.
          const quiz = b.open ? parsePartialQuiz(b.text) : parseQuiz(b.text)
          if (quiz) return <QuizCard key={i} quiz={quiz} writing={b.open} />
          if (b.open) return <div key={i} className="quiz quiz-loading">Preparing your quiz…</div>
        }
        if (b.type === 'code') return <CodeBlock key={i} lang={b.lang} text={b.text} />
        if (b.type === 'list') {
          const items = b.items.map((it, j) => (
            <li key={j}>
              <InlineText parts={it} />
            </li>
          ))
          return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>
        }
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <InlineText parts={line} />
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
