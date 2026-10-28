/**
 * "Generate your AI": first-run wizard. Saves the profile, which is then
 * used to build the system prompt, the tool list and the allowlist.
 */
import { useEffect, useState } from 'react'
import type { Profile, SkillInfo } from '@shared/ipc'
import { Orb } from '../components/Orb'
import { PermissionChecklist } from '../components/PermissionChecklist'
import { FoldersField, IdentityFields, PermissionsField, ProactiveField, SkillsField } from '../components/ProfileFields'

const STEPS = ['Identity', 'Folders', 'Permissions', 'Skills'] as const

export function Setup({ initial, onDone }: { initial: Profile; onDone: (p: Profile) => void }) {
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState(initial)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }))

  useEffect(() => {
    window.pai.listSkills().then((r) => {
      if (!r.ok) return
      setSkills(r.value)
      // First run: every working skill starts switched on.
      if (!initial.setupComplete) {
        set({ enabledSkills: r.value.filter((s) => !s.error).map((s) => s.id) })
      }
    })
  }, [initial.setupComplete])

  async function generate() {
    setGenerating(true)
    setError(null)
    const [res] = await Promise.all([
      window.pai.saveProfile({ ...profile, setupComplete: true }),
      new Promise((r) => setTimeout(r, 1600)) // let the animation play
    ])
    if (res.ok) onDone(res.value)
    else {
      setError(res.error)
      setGenerating(false)
    }
  }

  if (generating) {
    return (
      <main className="setup setup-generating">
        <Orb busy size={180} />
        <h1 className="headline">Generating {profile.assistantName || 'your AI'}…</h1>
        <p className="sub">Writing personality · locking folders · loading skills</p>
      </main>
    )
  }

  return (
    <main className="setup">
      <div className="setup-head">
        <Orb size={72} />
        <div>
          <h1 className="headline">Generate your AI</h1>
          <p className="sub">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
        </div>
      </div>

      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <button type="button" onClick={() => setStep(i)}>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <section className="glass panel setup-panel">
        {step === 0 && <IdentityFields profile={profile} set={set} />}
        {step === 1 && <FoldersField profile={profile} set={set} />}
        {step === 2 && (
          <>
            <PermissionsField profile={profile} set={set} />
            <PermissionChecklist />
          </>
        )}
        {step === 3 && (
          <>
            <SkillsField profile={profile} set={set} skills={skills} />
            <ProactiveField profile={profile} set={set} />
          </>
        )}
        {error && <p className="error-box">{error}</p>}
      </section>

      <div className="setup-actions">
        <button className="btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button className="btn-primary btn-inline" onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button className="btn-primary btn-inline" onClick={generate}>
            Generate {profile.assistantName || 'my AI'}
          </button>
        )}
      </div>
    </main>
  )
}
