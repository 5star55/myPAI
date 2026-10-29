/**
 * Settings — the generated AI's preferences, one section at a time.
 *
 *   ┌ sections ┐┌ section title / description ───────────────┐
 *   │ General  ││ [card] row: label + help ........ control │
 *   │ Voice    ││ [card] ...                                │
 *   └──────────┘└───────────────────────────────────────────┘
 *              [ You have unsaved changes · Discard · Save ]   (only when needed)
 *
 * Switches in "General" (on/off, quiet mode) apply instantly. Everything else
 * is edited locally and saved with the Save bar.
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DEFAULT_COMPOSE_APPS, hotkeyLabelFor, isValidHotkey } from '@shared/compose'
import { VOICE_HOTKEY, type AppState, type ComposeAccess, type Profile, type PublicConfig, type SkillInfo } from '@shared/ipc'
import { ApiKeyField } from '../components/ApiKeyField'
import { FoldersField, IdentityFields, PermissionsField, SkillsField } from '../components/ProfileFields'
import { Toggle } from '../components/Toggle'
import { VoicePicker } from '../components/VoicePicker'

interface Props {
  profile: Profile
  state: AppState
  config: PublicConfig | null
  onSaved: (p: Profile) => void
  onConfig: (c: PublicConfig) => void
}

const SECTIONS = [
  { id: 'general', label: 'General', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2' },
  { id: 'model', label: 'AI model', icon: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v-3h2v-2h2l1.1-1.1A4 4 0 0 1 15 7zM16 10h.01' },
  { id: 'personality', label: 'Personality', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 4.5-6 8-6s6.5 2 8 6' },
  { id: 'voice', label: 'Voice', icon: 'M9 3h6v11H9zM5 11a7 7 0 0 0 14 0M12 18v3' },
  { id: 'writing', label: 'Writing', icon: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4' },
  { id: 'folders', label: 'Folders', icon: 'M3 6h6l2 2h10v11H3z' },
  { id: 'permissions', label: 'Permissions', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' },
  { id: 'commands', label: 'Commands', icon: 'M4 17l5-5-5-5M12 19h8' },
  { id: 'skills', label: 'Skills', icon: 'M12 2l2.6 6.6L21 9l-5 4.4L17.5 21 12 17l-5.5 4L8 13.4 3 9l6.4-.4z' }
] as const
type Section = (typeof SECTIONS)[number]['id']

const isMac = navigator.userAgent.includes('Mac')

const hotkeyLabel = isMac ? '⌘⇧Space' : VOICE_HOTKEY.replace('CommandOrControl', 'Ctrl').replace(/\+/g, '+')

function loadSection(): Section {
  try {
    const s = localStorage.getItem('pai.settingsSection')
    if (SECTIONS.some((x) => x.id === s)) return s as Section
  } catch {
    /* default below */
  }
  return 'general'
}

export function SettingsView({ profile: saved, state, config, onSaved, onConfig }: Props) {
  const [section, setSection] = useState<Section>(loadSection)
  const [profile, setProfile] = useState(saved)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [approvals, setApprovals] = useState<string[]>([])
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }))
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved)
  const name = profile.assistantName || 'pai'

  useEffect(() => setProfile(saved), [saved])
  useEffect(() => {
    window.pai.listSkills().then((r) => r.ok && setSkills(r.value))
    window.pai.listApprovals().then((r) => r.ok && setApprovals(r.value))
  }, [])

  function go(s: Section) {
    setSection(s)
    try {
      localStorage.setItem('pai.settingsSection', s)
    } catch {
      /* not remembered */
    }
  }

  async function save() {
    const res = await window.pai.saveProfile(profile)
    if (res.ok) {
      onSaved(res.value)
      setStatus({ ok: true, text: 'Saved' })
    } else setStatus({ ok: false, text: res.error })
    setTimeout(() => setStatus(null), 2200)
  }

  return (
    <section className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        <h1 className="settings-title">Settings</h1>
        {SECTIONS.map((s) => (
          <button key={s.id} className={`settings-tab ${section === s.id ? 'active' : ''}`} onClick={() => go(s.id)}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden>
              <path d={s.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="settings-body">
        {section === 'general' && (
          <Page title="General" sub={`Turn ${name} on or off, and control when it speaks up.`}>
            <Card>
              <Row label="Assistant on" help="The off switch. Turning it off stops the current reply and denies everything waiting.">
                <Toggle on={state.enabled} onChange={(on) => window.pai.setEnabled(on)} label="Assistant on" />
              </Row>
              <Row label="Quiet mode" help="No proactive offers until you turn this off.">
                <Toggle on={state.quietMode} onChange={(on) => window.pai.setQuiet(on)} label="Quiet mode" />
              </Row>
              <Row label="Proactive offers" help="Suggestions based on the app you're using and new downloads. Never acts on its own; window titles stay in memory only.">
                <Toggle on={profile.proactive} onChange={(on) => set({ proactive: on })} label="Proactive offers" />
              </Row>
            </Card>
            <NotificationsCard name={name} />
            <Card title="Start over">
              <Row label="Re-run “Generate your AI”" help="Walk through setup again. Memory, chats and logs are kept.">
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    const r = await window.pai.saveProfile({ ...saved, setupComplete: false })
                    if (r.ok) onSaved(r.value)
                  }}
                >
                  Re-run setup
                </button>
              </Row>
            </Card>
          </Page>
        )}

        {section === 'model' && (
          <Page title="AI model" sub={`The key ${name} uses to reach its AI (NVIDIA Nemotron on Nebius Token Factory), and which models it uses.`}>
            <Card title="Nebius API key">
              <ApiKeyField config={config} onChange={onConfig} />
            </Card>
            {config && (
              <Card title="Models">
                <Row label="Mode">
                  <span className={`chip chip-${config.mode}`}>{config.mode === 'mock' ? 'MOCK' : 'LIVE'}</span>
                </Row>
                <Row label="Chat model">
                  <code>{config.smallModel}</code>
                </Row>
                <Row label="Tool model">
                  <code>{config.bigModel}</code>
                </Row>
                <Row label="Web search">
                  <span className={config.webSearchConfigured ? 'ok-text' : 'muted'}>{config.webSearchConfigured ? 'Configured' : 'Not configured'}</span>
                </Row>
                <p className="card-foot">
                  The installed app uses these models on Nebius. When running from source, <code>.env</code> can change them (restart {name} after editing it).
                </p>
              </Card>
            )}
          </Page>
        )}

        {section === 'personality' && (
          <Page title="Personality" sub={`Who ${name} is and how it talks to you.`}>
            <Card>
              <IdentityFields profile={profile} set={set} />
            </Card>
          </Page>
        )}

        {section === 'voice' && (
          <Page title="Voice" sub="How replies sound, and talking hands-free from any app. Click a voice to hear it.">
            <Card title="Speaking voice">
              <VoicePicker profile={profile} set={set} />
            </Card>
            <Card title="Hands-free">
              <Row label={<>Push to talk: <kbd className="key">{hotkeyLabel}</kbd></>} help={`Works in any app. Talk, pause, and ${name} answers out loud. Safe actions can be approved by saying “yes”.`}>
                <button className="btn-ghost" onClick={() => window.pai.toggleVoice()} disabled={!state.enabled}>
                  Try it
                </button>
              </Row>
              <Row
                label={`Wake word: “Hey ${name}”`}
                help="Listens for its name so you don't need the shortcut. The mic stays on (you'll see the mic indicator); nothing is recorded or saved."
              >
                <Toggle on={profile.wakeWord} onChange={(on) => set({ wakeWord: on })} label="Wake word" />
              </Row>
            </Card>
          </Page>
        )}

        {section === 'writing' && <WritingSection profile={profile} set={set} config={config} name={name} />}

        {section === 'folders' && (
          <Page title="Folders" sub={`Where ${name} may work with files. Anything else asks with a warning first.`}>
            <Card title="Approved folders">
              <FoldersField profile={profile} set={set} />
            </Card>
            <Card title="Always-allowed actions">
              {approvals.length === 0 ? (
                <p className="empty">None yet. Tick “always allow” in a permission dialog to add one.</p>
              ) : (
                <ul className="folder-list">
                  {approvals.map((key) => {
                    const [tool, folder] = key.split('|')
                    return (
                      <li key={key} className="folder glass">
                        <span>
                          <code>{tool}</code> in <code>{folder}</code>
                        </span>
                        <button
                          className="btn-ghost danger"
                          onClick={async () => {
                            const r = await window.pai.removeApproval(key)
                            if (r.ok) setApprovals(r.value)
                          }}
                        >
                          Revoke
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </Page>
        )}

        {section === 'permissions' && (
          <Page title="Permissions" sub="What kinds of actions are allowed at all. You still approve each action in a dialog.">
            <Card>
              <PermissionsField profile={profile} set={set} />
            </Card>
          </Page>
        )}

        {section === 'commands' && (
          <Page title="Terminal commands" sub={`Let ${name} run commands on this computer, and choose how they're approved.`}>
            <Card>
              <Row label={`Let ${name} run commands`} help="Commands can do anything your user account can.">
                <Toggle on={profile.permissions.shell} onChange={(on) => set({ permissions: { ...profile.permissions, shell: on } })} label="Run terminal commands" />
              </Row>
            </Card>
            <Card title="Approval">
              <div className={`choice-grid ${profile.permissions.shell ? '' : 'is-disabled'}`}>
                <button type="button" className={`choice glass ${profile.commandMode === 'ask' ? 'choice-on' : ''}`} onClick={() => set({ commandMode: 'ask' })} disabled={!profile.permissions.shell}>
                  <strong>Ask every time</strong>
                  <small>Shows the exact command and folder before each one runs.</small>
                </button>
                <button type="button" className={`choice glass ${profile.commandMode === 'auto' ? 'choice-on' : ''}`} onClick={() => set({ commandMode: 'auto' })} disabled={!profile.permissions.shell}>
                  <strong>Run and report</strong>
                  <small>Runs right away; each command and its output shows in the chat and the Activity log.</small>
                </button>
              </div>
            </Card>
            <Card title="Always protected">
              <ul className="bullets">
                <li>Risky commands (sudo, rm -r, downloads piped into a shell, git push…) always need a double confirmation.</li>
                <li>Commands start inside your approved folders; anything outside them asks first.</li>
                <li>{name}'s own files, your .env and your keys are off-limits; API keys are hidden from commands.</li>
                <li>A 60-second time limit, and Stop or the power button ends a command instantly.</li>
              </ul>
            </Card>
          </Page>
        )}

        {section === 'skills' && (
          <Page title="Skills" sub="Extra know-how from files in the skills/ folder. A skill only works if its permissions are on.">
            <Card>
              <SkillsField profile={profile} set={set} skills={skills} />
            </Card>
          </Page>
        )}
      </div>

      {(dirty || status) && (
        <div className={`save-bar glass ${status && !dirty ? (status.ok ? 'save-ok' : 'save-err') : ''}`} role="status">
          {dirty ? (
            <>
              <span>You have unsaved changes</span>
              <button className="btn-ghost" onClick={() => setProfile(saved)}>
                Discard
              </button>
              <button className="btn-primary btn-inline" onClick={save}>
                Save changes
              </button>
            </>
          ) : (
            <span>{status?.ok ? '✓ ' : ''}{status?.text}</span>
          )}
        </div>
      )}
    </section>
  )
}

function NotificationsCard({ name }: { name: string }) {
  const [result, setResult] = useState<string | null>(null)
  return (
    <Card title="Reminders & notifications">
      <Row
        label="Test notification"
        help={`Reminders always appear on ${name}'s floating orb with a chime and are read aloud. They are also sent as system notifications.`}
      >
        <button
          className="btn-ghost"
          onClick={async () => {
            const r = await window.pai.testNotification()
            setResult(r.ok && r.value ? 'sent' : 'unsupported')
          }}
        >
          Send test
        </button>
      </Row>
      {result === 'sent' && (
        <p className="card-foot">
          Sent. Didn't see it? {isMac ? (
            <>
              Open <b>System Settings → Notifications</b>, find <b>Electron</b> (that's {name} while running from source), turn on{' '}
              <b>Allow notifications</b> and choose <b>Alerts</b>. Also check that a Focus mode isn't on.
            </>
          ) : (
            <>Check your system's notification settings and Do Not Disturb.</>
          )}
        </p>
      )}
      {result === 'unsupported' && <p className="card-foot">This system doesn't support notifications; reminders will still show on the orb.</p>}
    </Card>
  )
}

const isLocalModel = (config: PublicConfig | null) => !config || config.mode === 'mock' || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(config.baseURL)

/** "Complete my text": a shortcut you choose, in other apps. */
function WritingSection({ profile, set, config, name }: { profile: Profile; set: (p: Partial<Profile>) => void; config: PublicConfig | null; name: string }) {
  const [access, setAccess] = useState<ComposeAccess | null>(null)
  const compose = profile.compose
  const composeKey = hotkeyLabelFor(compose.hotkey, isMac)
  const setCompose = (patch: Partial<Profile['compose']>) => set({ compose: { ...compose, ...patch } })
  const check = (prompt = false) => window.pai.composeAccess(prompt).then((r) => r.ok && setAccess(r.value))

  useEffect(() => {
    void check()
    // Re-check when you come back from System Settings.
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const local = isLocalModel(config)
  const unavailable = access?.available === false
  return (
    <Page title="Writing" sub={`Let ${name} help finish what you're typing in other apps, like an email or a message.`}>
      <Card>
        <Row
          label="Shortcut"
          help="Press this in a text box to get suggestions. Needs at least one modifier key. Alt+Space is taken by the Windows window menu."
        >
          <HotkeyField value={compose.hotkey} mac={isMac} onChange={(accel) => setCompose({ hotkey: accel })} />
        </Row>
        <Row
          label={<>Complete my text: <kbd className="key">{composeKey}</kbd></>}
          help={
            unavailable
              ? isMac
                ? "The text helper isn't built. Install Xcode's command line tools (xcode-select --install) and restart."
                : 'The Windows text helper is not built yet. Run npm run build once, then restart.'
              : `In a text box in an allowed app, press ${composeKey} and pick one of 3 ways to finish your sentence. ${name} reads the text only when you press it.`
          }
        >
          <Toggle on={compose.enabled} onChange={(on) => setCompose({ enabled: on })} label="Complete my text" disabled={unavailable} />
        </Row>
        {isMac && access?.available && (
          <Row
            label="Accessibility permission"
            help={access.trusted ? 'Granted. macOS lets pai read and type into the text box you are in.' : `macOS needs this to let ${name} read the text box you're typing in. Turn on pai (or "Electron" when running from source, or the terminal you started it from).`}
          >
            {access.trusted ? <span className="ok-text">✓ Granted</span> : <button className="btn-ghost" onClick={() => check(true)}>Grant access…</button>}
          </Row>
        )}
      </Card>

      <Card title="Allowed apps">
        {compose.apps.length === 0 ? (
          <p className="empty">None. Press {composeKey} in an app to allow it from there.</p>
        ) : (
          <div className="compose-apps">
            {compose.apps.map((a) => (
              <span key={a.id} className="chip-suggestion" title={a.id}>
                {a.name}
                <button className="icon-mini" aria-label={`Remove ${a.name}`} onClick={() => setCompose({ apps: compose.apps.filter((x) => x.id !== a.id) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="card-foot">
          Pressing {composeKey} in any other app asks “Allow in that app?” first.{' '}
          <button className="link-btn" onClick={() => setCompose({ apps: DEFAULT_COMPOSE_APPS.map((a) => ({ ...a })) })}>
            Reset to the default list
          </button>
        </p>
      </Card>

      <Card title="Privacy">
        <Row
          label="Allow a cloud model"
          help={
            local
              ? 'Your model runs on this computer, so your text never leaves it. This only matters if you switch .env to a cloud model.'
              : `Your model is in the cloud (${config?.baseURL}). With this on, the text before your cursor is sent there to write suggestions.`
          }
        >
          <Toggle on={compose.allowCloud} onChange={(on) => setCompose({ allowCloud: on })} label="Allow a cloud model" />
        </Row>
        <ul className="bullets">
          <li>Reads only when you press {composeKey}, and only the box you're typing in.</li>
          <li>Never reads password fields, terminals or password managers.</li>
          <li>Nothing you type is saved. The Activity log only notes the app and how many characters were inserted.</li>
          <li>Nothing is inserted until you pick an option.</li>
        </ul>
      </Card>
    </Page>
  )
}

const ARROWS: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }

function HotkeyField({ value, mac, onChange }: { value: string; mac: boolean; onChange: (accel: string) => void }) {
  const [capturing, setCapturing] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  function capture(e: KeyboardEvent<HTMLButtonElement>) {
    if (!capturing) return
    e.preventDefault()
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return // wait for the real key
    const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Command'].filter(Boolean) as string[]
    // Use the physical key: on a Mac, Option+K reports e.key as "˚".
    const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : (ARROWS[e.key] ?? (e.key === ' ' ? 'Space' : e.key))
    const accel = [...mods, key].join('+')
    setCapturing(false)
    if (!isValidHotkey(accel)) return setNote('Use at least one modifier key (Ctrl, Alt, Shift or ⌘) and a letter, number or named key.')
    if (accel === 'Alt+Space') return setNote('Alt+Space opens the Windows window menu, so pick another.')
    setNote(null)
    onChange(accel)
  }

  return (
    <div className="hotkey-field">
      <kbd className="key">{hotkeyLabelFor(value, mac)}</kbd>
      <button
        className="btn-ghost"
        onClick={() => {
          setCapturing(true)
          setNote(null)
        }}
        onKeyDown={capture}
        onBlur={() => setCapturing(false)}
      >
        {capturing ? 'Press new keys…' : 'Change'}
      </button>
      {note && <p className="card-foot">{note}</p>}
    </div>
  )
}

function Page({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="settings-page">
      <header className="settings-head">
        <h2>{title}</h2>
        <p>{sub}</p>
      </header>
      {children}
    </div>
  )
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="s-card glass">
      {title && <h3 className="s-card-title">{title}</h3>}
      {children}
    </section>
  )
}

function Row({ label, help, children }: { label: ReactNode; help?: string; children: ReactNode }) {
  return (
    <div className="s-row">
      <div className="s-row-text">
        <div className="s-row-label">{label}</div>
        {help && <div className="s-row-help">{help}</div>}
      </div>
      <div className="s-row-control">{children}</div>
    </div>
  )
}