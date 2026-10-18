/** Reminders: what is scheduled, with delete. Ask the assistant to add new ones. */
import { useData } from '../hooks'

export function RemindersView() {
  const { data, error, reload } = useData(() => window.pai.listReminders(), 'reminders')

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">Reminders</h1>
          <p className="view-sub">Native notifications, one-time or repeating. Ask in chat: “remind me to stretch in 20 minutes”.</p>
        </div>
      </header>
      {error && <p className="error-box">{error}</p>}
      {data && data.length === 0 && <p className="empty">No reminders scheduled.</p>}
      <ul className="cards">
        {data?.map((r) => (
          <li key={r.id} className="card glass">
            <div className="card-main">
              <div className="card-text">{r.message}</div>
              <div className="card-meta">
                {new Date(r.nextAt).toLocaleString()}
                {r.repeat !== 'none' && <span className="badge badge-ok">{r.repeat}</span>}
              </div>
            </div>
            <button
              className="btn-ghost danger"
              onClick={async () => {
                await window.pai.deleteReminder(r.id)
                void reload()
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
