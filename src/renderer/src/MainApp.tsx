/**
 * MainApp — the main window: first-run setup, then the app shell with
 * sidebar navigation, the power switch, and the permission dialog.
 */
import { useCallback, useEffect, useState } from 'react'
import type { AppState, Profile, PublicConfig } from '@shared/ipc'
import { Chat } from './components/Chat'
import { PermissionDialog } from './components/PermissionDialog'
import { PowerSwitch } from './components/PowerSwitch'
import { useData, usePaiEvent } from './hooks'
import { handsFree } from './voice/handsFree'
import { setVoiceChoice, speak } from './audio'
import { ActivityView } from './views/ActivityView'
import { MemoryView } from './views/MemoryView'
import { RemindersView } from './views/RemindersView'
import { SettingsView } from './views/SettingsView'
import { Setup } from './views/Setup'
import { SkillsView } from './views/SkillsView'
import { Ecospace } from './views/Ecospace'
import { runTaskAndWait } from './tasks'

const TABS = [
  { id: 'ecospace', label: 'Ecospace', icon: 'M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4zM5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9zM19 15l.7 1.6 1.6.7-1.6.7L19 20l-.7-1.6-1.6-.7 1.6-.7z' },
  { id: 'chat', label: 'Chat', icon: 'M4 5h16v11H8l-4 4z' },
  { id: 'activity', label: 'Activity', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { id: 'memory', label: 'Memory', icon: 'M12 3a6 6 0 0 0-6 6c0 2.5 1.5 3.5 2 5v3h8v-3c.5-1.5 2-2.5 2-5a6 6 0 0 0-6-6zM9 21h6' },
  { id: 'reminders', label: 'Reminders', icon: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' },
  { id: 'skills', label: 'Skills', icon: 'M12 2l2.6 6.6L21 9l-5 4.4L17.5 21 12 17l-5.5 4L8 13.4 3 9l6.4-.4z' },
  { id: 'settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2.3L6 8.7 4 8.4l-1 3 2 1v2l-2 1 1 3 2-.3 1.5 1.5L7 21l3 1 1-2h2l1 2 3-1-.5-2.3 1.5-1.5 2 .3 1-3-2-1z' }
] as const
type Tab = (typeof TABS)[number]['id']

export function MainApp() {
  const [tab, setTab] = useState<Tab>('ecospace')
  // Bumped when main opens a Settings section, so Settings re-reads which section to show.
  const [settingsKey, setSettingsKey] = useState(0)
  const [ecoDraft, setEcoDraft] = useState<string | null>(null)
  const takeEcoDraft = useCallback(() => setEcoDraft(null), [])
  const [state, setState] = useState<AppState | null>(null)
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const profile = useData<Profile>(() => window.pai.getProfile(), 'profile')

  useEffect(() => {
    window.pai.getConfig().then((r) => r.ok && setConfig(r.value))
    window.pai.getState().then((r) => r.ok && setState(r.value))
  }, [])
  // A key saved or removed (here or in setup) changes what the app can do.
  usePaiEvent('data:changed', ({ what }) => {
    if (what === 'config') window.pai.getConfig().then((r) => r.ok && setConfig(r.value))
  })
  function openKeySettings() {
    try {
      localStorage.setItem('pai.settingsSection', 'model')
    } catch {
      /* Settings opens on its default section */
    }
    setSettingsKey((k) => k + 1)
    setTab('settings')
  }
  usePaiEvent('state:changed', setState)
  usePaiEvent('ui:navigate', ({ tab: t, section }) => {
    if (section) {
      try {
        localStorage.setItem('pai.settingsSection', section) // Settings opens on this section
      } catch {
        /* opens on its default section */
      }
      setSettingsKey((k) => k + 1)
    }
    setTab(t)
  })
  // Reminders are also read aloud (not in quiet mode, and not over a voice conversation).
  usePaiEvent('reminder:fired', ({ message }) => {
    if (!state?.quietMode && !handsFree.active) speak(`Reminder: ${message}`)
  })

  // Talking to pai (hotkey, "Hey <name>", the mic in the Ecospace or on the orb) runs a task.
  useEffect(() => {
    handsFree.setSender((text) => runTaskAndWait(text, 'voice'))
    handsFree.setEditor((text) => {
      setEcoDraft(text)
      setTab('ecospace')
    })
    return () => {
      handsFree.setSender(null)
      handsFree.setEditor(null)
    }
  }, [])
  usePaiEvent('voice:toggle', () => void handsFree.toggle())
  usePaiEvent('voice:review', ({ action, text }) => handsFree.resolveReview(action, text))

  // Hands-free voice follows the profile (name = wake word) and the off switch.
  const p = profile.data
  useEffect(() => {
    if (p) setVoiceChoice(p.voice)
  }, [p?.voice.engine, p?.voice.voice, p?.voice.rate])
  useEffect(() => {
    if (!p || !state || !p.setupComplete) return
    void handsFree.configure({ name: p.assistantName, wakeWord: p.wakeWord, enabled: state.enabled })
  }, [p?.assistantName, p?.wakeWord, p?.setupComplete, state?.enabled])

  if (!profile.data || !state) return <div className="shell" />

  if (!profile.data.setupComplete) {
    return (
      <div className="shell">
        <div className="grid-bg" aria-hidden />
        <Setup initial={profile.data} onDone={(p) => profile.setData(p)} />
      </div>
    )
  }

  const name = profile.data.assistantName
  return (
    <div className={`shell ${state.enabled ? '' : 'is-off'}`}>
      <div className="grid-bg" aria-hidden />
      <header className="topbar">
        <span className="brand">
          {name}
          <span className="brand-dot" />
        </span>
        <span className="topbar-right">
          {config && <span className="model-tag">{config.mode === 'mock' ? 'mock' : config.smallModel}</span>}
          {config && <span className={`chip chip-${config.mode}`}>{config.mode === 'mock' ? 'MOCK' : 'LIVE'}</span>}
          {state.quietMode && <span className="chip chip-quiet">QUIET</span>}
          <PowerSwitch on={state.enabled} />
        </span>
      </header>

      {config?.needsApiKey && (
        <p className="warning banner key-banner" role="status">
          <span>Add your Nebius API key to start using {name}. Until then, nothing can be answered.</span>
          <button className="btn-primary btn-inline btn-sm" onClick={openKeySettings}>
            Add key
          </button>
        </p>
      )}
      {config?.warnings.map((w) => (
        <p key={w} className="warning banner">
          ⚠ {w}
        </p>
      ))}
      {!state.enabled && (
        <p className="off-banner banner" role="status">
          {name} is OFF. No tools, no model calls, no offers. Use the power switch to turn it back on.
        </p>
      )}

      <div className="body">
        <nav className="sidebar" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} title={t.label}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="content">
          {tab === 'ecospace' && <Ecospace profile={profile.data} enabled={state.enabled} incomingDraft={ecoDraft} onDraftTaken={takeEcoDraft} />}
          {/* Chat stays mounted so the conversation survives tab switches. */}
          <div className="tab-pane" hidden={tab !== 'chat'}>
            <Chat assistantName={name} enabled={state.enabled} />
          </div>
          {tab === 'activity' && <ActivityView />}
          {tab === 'memory' && <MemoryView />}
          {tab === 'reminders' && <RemindersView />}
          {tab === 'skills' && <SkillsView profile={profile.data} onSaved={(p) => profile.setData(p)} />}
          {tab === 'settings' && (
            <SettingsView key={settingsKey} profile={profile.data} state={state} config={config} onSaved={(p) => profile.setData(p)} onConfig={setConfig} />
          )}
        </div>
      </div>

      <PermissionDialog />
    </div>
  )
}
