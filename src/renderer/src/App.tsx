/**
 * App shell: top bar + the current screen.
 * More screens (activity log, memory, settings, setup) join here in later steps.
 */
import { useEffect, useState } from 'react'
import type { PublicConfig } from '@shared/ipc'
import { Chat } from './components/Chat'

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)

  useEffect(() => {
    window.pai.getConfig().then((res) => res.ok && setConfig(res.value))
  }, [])

  return (
    <div className="shell">
      <div className="grid-bg" aria-hidden />
      <header className="topbar">
        <span className="brand">
          pai<span className="brand-dot" />
        </span>
        {config && (
          <span className="topbar-right">
            <span className="model-tag">{config.mode === 'mock' ? 'mock-small' : config.smallModel}</span>
            <span className={`chip chip-${config.mode}`}>{config.mode === 'mock' ? 'MOCK MODE' : 'LIVE'}</span>
          </span>
        )}
      </header>

      {config?.warnings.map((w) => (
        <p key={w} className="warning banner">
          ⚠ {w}
        </p>
      ))}

      <Chat />
    </div>
  )
}
