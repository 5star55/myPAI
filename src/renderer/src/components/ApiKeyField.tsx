/**
 * ApiKeyField — paste the Nebius API key (Settings → AI model, and first-run setup).
 * The key goes to main, which checks it with Nebius and stores it encrypted in pai's data
 * folder. Only its last 4 characters ever come back to show here.
 */
import { useState } from 'react'
import type { PublicConfig } from '@shared/ipc'

const KEYS_PAGE = 'https://tokenfactory.nebius.com/'

export function ApiKeyField({ config, onChange }: { config: PublicConfig | null; onChange: (c: PublicConfig) => void }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    setBusy(true)
    setMessage(null)
    const res = await window.pai.saveApiKey(draft)
    setBusy(false)
    if (!res.ok) return setMessage({ ok: false, text: res.error })
    setDraft('')
    onChange(res.value.config)
    setMessage({ ok: true, text: res.value.note ?? 'Key saved and checked. You can start chatting.' })
  }

  async function remove() {
    const res = await window.pai.removeApiKey()
    if (!res.ok) return setMessage({ ok: false, text: res.error })
    onChange(res.value)
    setMessage({ ok: true, text: res.value.needsApiKey ? 'Key removed. Paste a new one to keep using pai.' : 'Key removed.' })
  }

  const status = !config
    ? null
    : config.apiKeySource === 'settings'
      ? `A key ending in ${config.apiKeyHint.replace('…', '')} is saved on this computer.`
      : config.apiKeySource === 'env'
        ? `Using MODEL_API_KEY from .env (ending in ${config.apiKeyHint.replace('…', '')}). A key saved here is used instead.`
        : config.needsApiKey
          ? 'No key yet. pai needs one to answer.'
          : 'Not needed: this setup uses a local model or mock mode.'

  return (
    <div className="api-key">
      {status && <p className={`api-key-status ${config?.needsApiKey ? 'is-missing' : ''}`}>{status}</p>}
      <form
        className="api-key-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim() && !busy) void save()
        }}
      >
        <input
          id="api-key-input"
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={config?.apiKeySource === 'settings' ? 'Paste a new key to replace it' : 'Paste your Nebius API key'}
          autoComplete="off"
          spellCheck={false}
          aria-label="Nebius API key"
        />
        <button type="submit" className="btn-primary btn-inline" disabled={!draft.trim() || busy}>
          {busy ? 'Checking…' : 'Save'}
        </button>
        {config?.apiKeySource === 'settings' && (
          <button type="button" className="btn-ghost" onClick={() => void remove()} disabled={busy}>
            Remove
          </button>
        )}
      </form>
      {message && <p className={message.ok ? 'ok-text' : 'error-text'}>{message.text}</p>}
      <p className="card-foot">
        Get a key from <a href={KEYS_PAGE} target="_blank" rel="noreferrer noopener">Nebius Token Factory</a> (API keys). It is stored encrypted
        on this computer only, never sent anywhere except Nebius, and never shown again here.
      </p>
    </div>
  )
}
