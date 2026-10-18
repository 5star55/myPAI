/** Web search results as tidy, clickable cards. */
import { useState } from 'react'
import type { WebResult } from '@shared/ipc'

const FIRST = 3

export function WebResults({ query, results }: { query: string; results: WebResult[] }) {
  const [all, setAll] = useState(false)
  if (results.length === 0) return <div className="web-empty">No web results for “{query}”.</div>
  const shown = all ? results : results.slice(0, FIRST)

  return (
    <section className="web" aria-label={`Web results for ${query}`}>
      <header className="web-head">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="web-query">“{query}”</span>
        <span className="web-count">{results.length} sources</span>
      </header>
      <ol className="web-list">
        {shown.map((r, i) => (
          <li key={r.url}>
            <a className="web-card" href={r.url} target="_blank" rel="noreferrer noopener" title={r.url}>
              <div className="web-site">
                <span className="web-badge" aria-hidden>
                  {r.site.charAt(0).toUpperCase()}
                </span>
                <span>{r.site}</span>
                <span className="web-num">{i + 1}</span>
                <span className="web-open" aria-hidden>
                  ↗
                </span>
              </div>
              <div className="web-title">{r.title}</div>
              {r.snippet && <p className="web-snippet">{r.snippet}</p>}
            </a>
          </li>
        ))}
      </ol>
      {results.length > FIRST && (
        <button className="link-btn web-more" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show ${results.length - FIRST} more`}
        </button>
      )}
    </section>
  )
}
