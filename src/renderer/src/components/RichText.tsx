/** Renders an assistant reply with simple formatting. Built from parsed pieces, never raw HTML. */
import { Fragment } from 'react'
import { parseBlocks, type Inline } from '@shared/markdown'

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
