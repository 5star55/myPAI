/** Memory: view, add, edit and delete what the assistant remembers. */
import { useState } from 'react'
import type { MemoryItem } from '@shared/ipc'
import { timeAgo, useData } from '../hooks'

export function MemoryView() {
  const { data, error, reload } = useData(() => window.pai.listMemory(), 'memory')
  const [draft, setDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p
    setActionError(res.ok ? null : (res.error ?? 'Failed'))
    void reload()
    return res.ok
  }

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">Memory</h1>
          <p className="view-sub">Facts the assistant remembers about you. Saved in a local file; edit or delete anything.</p>
        </div>
      </header>

      <form
        className="add-row glass"
        onSubmit={async (e) => {
          e.preventDefault()
          if (draft.trim() && (await run(window.pai.addMemory(draft)))) setDraft('')
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a fact, e.g. “I work night shifts”" maxLength={500} />
        <button className="btn-primary btn-inline" disabled={!draft.trim()}>
          Add
        </button>
      </form>

      {(error || actionError) && <p className="error-box">{error ?? actionError}</p>}
      {data && data.length === 0 && <p className="empty">Nothing remembered yet. Try “remember that I like green tea”.</p>}
      <ul className="cards">
        {data?.map((m) => <MemoryRow key={m.id} item={m} run={run} />)}
      </ul>
    </section>
  )
}

function MemoryRow({ item, run }: { item: MemoryItem; run: (p: Promise<{ ok: boolean }>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)

  return (
    <li className="card glass">
      {editing ? (
        <form
          className="card-edit"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(window.pai.updateMemory(item.id, text))) setEditing(false)
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} autoFocus maxLength={500} />
          <button className="btn-ghost">Save</button>
          <button type="button" className="btn-ghost" onClick={() => (setText(item.text), setEditing(false))}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <div className="card-main">
            <div className="card-text">{item.text}</div>
            <div className="card-meta">{timeAgo(item.updatedAt)}</div>
          </div>
          <div className="row">
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button className="btn-ghost danger" onClick={() => run(window.pai.deleteMemory(item.id))}>
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  )
}
