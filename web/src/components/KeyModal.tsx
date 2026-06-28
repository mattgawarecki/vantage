import { useState } from 'react'

interface Props {
  hasKey: boolean
  onSave: (apiKey: string) => Promise<void>
  onClose: () => void
}

export function KeyModal({ hasKey, onSave, onClose }: Props) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!key.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSave(key.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to set key')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="key-card" onClick={(e) => e.stopPropagation()}>
        <h2>🔑 Claude API key</h2>
        <p className="key-status">
          {hasKey ? 'A key is set. Enter a new one to replace it.' : 'No key set — Explain & Ask are disabled.'}
        </p>
        <input
          className="entry-input"
          type="password"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
        <p className="key-note">
          Stored in the server's memory only — never written to disk or logged. Get a key at
          {' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        </p>
        {error && <p className="entry-error">⛔ {error}</p>}
        <div className="entry-actions">
          <button className="entry-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="entry-go" onClick={save} disabled={busy || !key.trim()}>
            {busy ? 'Saving…' : 'Save key'}
          </button>
        </div>
      </div>
    </div>
  )
}
