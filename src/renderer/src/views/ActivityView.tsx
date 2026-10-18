/** Activity log: every tool request with time, tool, target and result. */
import { useState } from 'react'
import { useData } from '../hooks'

export function ActivityView() {
  const { data, error, reload } = useData(() => window.pai.listActivity(), 'activity')
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">Activity</h1>
          <p className="view-sub">Everything the assistant tried to do, newest first. Stored only on this computer.</p>
        </div>
        <div className="row">
          <button className="btn-ghost" onClick={reload}>
            Refresh
          </button>
          {confirmClear ? (
            <button
              className="btn-ghost danger"
              onClick={async () => {
                await window.pai.clearActivity()
                setConfirmClear(false)
                void reload()
              }}
            >
              Really clear?
            </button>
          ) : (
            <button className="btn-ghost" onClick={() => setConfirmClear(true)} disabled={!data?.length}>
              Clear log
            </button>
          )}
        </div>
      </header>

      {error && <p className="error-box">{error}</p>}
      {data && data.length === 0 && <p className="empty">No activity yet. Ask the assistant to do something.</p>}
      {data && data.length > 0 && (
        <div className="table-wrap glass">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Tool</th>
                <th>Target</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="mono nowrap">{new Date(e.time).toLocaleString()}</td>
                  <td className="mono">{e.tool}</td>
                  <td className="mono target-cell" title={e.target}>
                    {e.target}
                  </td>
                  <td>
                    <span className={`badge badge-${e.result}`}>{e.result}</span>
                    <div className="cell-detail">{e.detail}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
