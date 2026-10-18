/**
 * History — saved chats: search, open, rename, delete, start a new one.
 */
import { useEffect, useState } from 'react'
import type { ConversationMeta } from '@shared/ipc'

interface Props {
  currentId: string | null
  /** Bumped by the chat after each save, so the list refreshes. */
  version: number
  onOpen: (id: string) => void
  onNew: () => void
  onDeleted: (id: string) => void
}

function group(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return 'This week'
  if (days < 31) return 'This month'
  return 'Older'
}

export function History({ currentId, version, onOpen, onNew, onDeleted }: Props) {
  const [items, setItems] = useState<ConversationMeta[]>([])
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function load(q = query) {
    const res = await window.pai.listConversations(q || undefined)
    if (res.ok) setItems(res.value)
  }

  useEffect(() => {
    const t = setTimeout(() => void load(query), query ? 150 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, version])

  async function rename(id: string) {
    const res = await window.pai.renameConversation(id, renameText)
    setRenaming(null)
    if (res.ok) void load()
  }

  async function remove(id: string) {
    await window.pai.deleteConversation(id)
    setConfirmDelete(null)
    onDeleted(id)
    void load()
  }

  let lastGroup = ''
  return (
    <aside className="history" aria-label="Saved chats">
      <button className="btn-primary btn-inline history-new" onClick={onNew}>
        + New chat
      </button>
      <input className="history-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats…" aria-label="Search chats" />
      <ul className="history-list">
        {items.length === 0 && <li className="empty history-empty">{query ? 'No chats match.' : 'Your chats will be saved here.'}</li>}
        {items.map((c) => {
          const g = group(c.updatedAt)
          const header = !query && g !== lastGroup
          lastGroup = g
          return (
            <li key={c.id}>
              {header && <div className="history-group">{g}</div>}
              {renaming === c.id ? (
                <form
                  className="history-rename"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void rename(c.id)
                  }}
                >
                  <input value={renameText} onChange={(e) => setRenameText(e.target.value)} autoFocus onBlur={() => setRenaming(null)} maxLength={120} />
                </form>
              ) : (
                <div className={`history-item ${c.id === currentId ? 'active' : ''}`}>
                  <button className="history-open" onClick={() => onOpen(c.id)} title={c.title}>
                    <span className="history-title">{c.title}</span>
                    {c.match ? <span className="history-match">{c.match}</span> : <span className="history-meta">{c.messageCount} messages</span>}
                  </button>
                  {confirmDelete === c.id ? (
                    <span className="history-actions show">
                      <button className="link-btn danger" onClick={() => remove(c.id)}>
                        Delete
                      </button>
                      <button className="link-btn" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="history-actions">
                      <button
                        className="icon-mini"
                        title="Rename"
                        onClick={() => {
                          setRenaming(c.id)
                          setRenameText(c.title)
                        }}
                      >
                        ✎
                      </button>
                      <button className="icon-mini" title="Delete" onClick={() => setConfirmDelete(c.id)}>
                        🗑
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="history-foot">Saved only on this computer.</p>
    </aside>
  )
}
