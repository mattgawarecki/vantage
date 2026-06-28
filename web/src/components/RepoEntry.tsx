import { useState } from 'react'

interface Props {
  onSubmit: (path: string, target?: string) => Promise<void>
  onCancel?: () => void
  serverDown?: boolean
}

export function RepoEntry({ onSubmit, onCancel, serverDown }: Props) {
  const [path, setPath] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    if (!path.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(path.trim(), target.trim() || undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'analyze failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="entry">
      <div className="entry-card">
        <h1 className="entry-title">🧭 Vantage</h1>
        <p className="entry-tag">Orienteer an unfamiliar TypeScript / React codebase.</p>

        {serverDown && (
          <p className="entry-warn">
            ⚠ API server not reachable on <code>:8787</code> — showing sample data.
            Start it with <code>npm run dev:server</code>, then retry.
          </p>
        )}

        <label className="entry-label">
          Local repo path
          <input
            className="entry-input"
            placeholder="/Users/you/projects/excalidraw"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            autoFocus
          />
        </label>

        <label className="entry-label">
          Target subdir <span className="entry-opt">(optional — e.g. <code>packages/excalidraw</code>, <code>react</code>)</span>
          <input
            className="entry-input"
            placeholder="auto (src/ or repo root)"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
        </label>

        {error && <p className="entry-error">⛔ {error}</p>}

        <div className="entry-actions">
          {onCancel && (
            <button className="entry-cancel" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
          <button className="entry-go" onClick={go} disabled={busy || !path.trim()}>
            {busy ? 'Charting terrain…' : 'Explore →'}
          </button>
        </div>
      </div>
    </div>
  )
}
