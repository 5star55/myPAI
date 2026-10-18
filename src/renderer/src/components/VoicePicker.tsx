/**
 * VoicePicker — choose how replies sound. Click any voice to hear a sample.
 *   Natural:    local AI voices (Kokoro), the most human-sounding.
 *   Mac/PC:     the OS's built-in voices; better ones can be downloaded for free.
 */
import { useEffect, useRef, useState } from 'react'
import { NATURAL_VOICES, type Profile, type VoiceChoice } from '@shared/ipc'
import { listSystemVoices, speakAsync, stopSpeaking, type SystemVoiceInfo } from '../audio'

interface Props {
  profile: Profile
  set: (patch: Partial<Profile>) => void
}

const isMac = navigator.userAgent.includes('Mac')

export function VoicePicker({ profile, set }: Props) {
  const choice = profile.voice
  const [systemVoices, setSystemVoices] = useState<SystemVoiceInfo[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  const [loadingNatural, setLoadingNatural] = useState(false)
  // Remember the last voice of each type, so switching tabs back and forth keeps your pick.
  const last = useRef({ natural: choice.engine === 'natural' ? choice.voice : 'af_heart', system: choice.engine === 'system' ? choice.voice : '' })
  last.current[choice.engine] = choice.voice

  const sample = `Hi${profile.userName ? ` ${profile.userName}` : ''}, I'm ${profile.assistantName}. This is how I'll sound when I read your replies.`

  useEffect(() => {
    const load = () => setSystemVoices(listSystemVoices())
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', load)
      stopSpeaking()
    }
  }, [])

  /** Select a voice and play the sample in it. Clicking the playing voice stops it. */
  async function pick(next: VoiceChoice, key: string) {
    if (playing === key) {
      stopSpeaking()
      setPlaying(null)
      return
    }
    set({ voice: next })
    setPlaying(key)
    if (next.engine === 'natural') setLoadingNatural(true)
    const t = setTimeout(() => setLoadingNatural(false), 400) // short delays shouldn't flash "downloading"
    await speakAsync(sample, next)
    clearTimeout(t)
    setLoadingNatural(false)
    setPlaying((p) => (p === key ? null : p))
  }

  const setRate = (rate: number) => set({ voice: { ...choice, rate } })

  return (
    <div className="fields">
      <div className="segmented" role="tablist" aria-label="Voice type">
        <button
          role="tab"
          aria-selected={choice.engine === 'natural'}
          className={choice.engine === 'natural' ? 'on' : ''}
          onClick={() => set({ voice: { ...choice, engine: 'natural', voice: NATURAL_VOICES.some((v) => v.id === last.current.natural) ? last.current.natural : 'af_heart' } })}
        >
          ✦ Natural (AI)
        </button>
        <button
          role="tab"
          aria-selected={choice.engine === 'system'}
          className={choice.engine === 'system' ? 'on' : ''}
          onClick={() => set({ voice: { ...choice, engine: 'system', voice: last.current.system || systemVoices[0]?.name || '' } })}
        >
          {isMac ? 'Mac voices' : 'System voices'}
        </button>
      </div>

      {choice.engine === 'natural' ? (
        <>
          <p className="hint">
            Human-sounding voices generated on this computer. The first sample downloads the voice model (~90 MB, once);
            after that it works offline.
          </p>
          <div className="voice-grid">
            {NATURAL_VOICES.map((v) => {
              const key = `n:${v.id}`
              const selected = choice.voice === v.id
              return (
                <button
                  key={v.id}
                  className={`vp-card ${selected ? 'selected' : ''} ${playing === key ? 'playing' : ''}`}
                  onClick={() => pick({ ...choice, engine: 'natural', voice: v.id }, key)}
                  aria-pressed={selected}
                  title={playing === key ? 'Click to stop' : 'Click to hear this voice'}
                >
                  <span className="voice-play" aria-hidden>
                    {playing === key ? <Bars /> : '▶'}
                  </span>
                  <span className="voice-name">
                    {v.name}
                    {v.best && <span className="voice-best">best</span>}
                  </span>
                  <span className="voice-meta">
                    {v.accent} · {v.gender}
                  </span>
                </button>
              )
            })}
          </div>
          {loadingNatural && playing && <p className="hint">Preparing the natural voice… (the first time can take a minute)</p>}
        </>
      ) : (
        <>
          <p className="hint">
            Built-in voices. The best ones (marked <span className="voice-best">premium</span>) are free downloads in your
            system settings.
          </p>
          <div className="voice-grid">
            {systemVoices.map((v) => {
              const key = `s:${v.name}`
              const selected = choice.voice === v.name
              return (
                <button
                  key={v.name}
                  className={`vp-card ${selected ? 'selected' : ''} ${playing === key ? 'playing' : ''}`}
                  onClick={() => pick({ ...choice, engine: 'system', voice: v.name }, key)}
                  aria-pressed={selected}
                >
                  <span className="voice-play" aria-hidden>
                    {playing === key ? <Bars /> : '▶'}
                  </span>
                  <span className="voice-name">
                    {v.name.replace(/\s*\((premium|enhanced)\)/i, '')}
                    {v.quality !== 'standard' && <span className="voice-best">{v.quality}</span>}
                  </span>
                  <span className="voice-meta">{v.lang}</span>
                </button>
              )
            })}
            {systemVoices.length === 0 && <p className="empty">No English system voices found.</p>}
          </div>
          <button className="btn-ghost" onClick={() => window.pai.openVoiceSettings()}>
            Get better {isMac ? 'Mac' : 'system'} voices…
          </button>
          {isMac && (
            <p className="hint">
              In the window that opens: <b>System voice → Manage Voices…</b>, then download e.g. <b>Ava (Premium)</b> or{' '}
              <b>Zoe (Premium)</b>. Restart {profile.assistantName} to see them here.
            </p>
          )}
        </>
      )}

      <label className="field">
        <span>
          Speed <b className="mono">{choice.rate.toFixed(2)}×</b>
        </span>
        <input
          type="range"
          min={0.8}
          max={1.3}
          step={0.05}
          value={choice.rate}
          onChange={(e) => setRate(Number(e.target.value))}
          onMouseUp={() => void speakAsync(sample, choice)}
          aria-label="Speaking speed"
        />
      </label>
    </div>
  )
}

function Bars() {
  return (
    <span className="eq">
      <i />
      <i />
      <i />
    </span>
  )
}
