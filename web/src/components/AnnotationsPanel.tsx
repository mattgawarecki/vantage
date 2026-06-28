import { useState } from 'react'
import type { Signal } from '@vantage/shared'
import { SIGNAL_META } from '../ui'
import { explain } from '../api'

interface Props {
  path: string | null
  signals: Signal[]
  activeLine: number | null
}

export function AnnotationsPanel({ path, signals, activeLine }: Props) {
  if (!path) return <p className="hint">Open a file to see its trail markers.</p>
  if (signals.length === 0) {
    return <p className="hint">No trail markers here — quiet stretch of trail.</p>
  }
  return (
    <ul className="annotations">
      {signals.map((s, i) => (
        <AnnotationCard
          key={`${s.kind}-${i}`}
          path={path}
          signal={s}
          active={activeLine !== null && s.line === activeLine}
        />
      ))}
    </ul>
  )
}

function AnnotationCard({ path, signal, active }: {
  path: string; signal: Signal; active: boolean
}) {
  const meta = SIGNAL_META[signal.kind]
  const [prose, setProse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onExplain() {
    setLoading(true)
    setProse(await explain(path, signal.line))
    setLoading(false)
  }

  return (
    <li className={`anno${active ? ' is-active' : ''}`}>
      <div className="anno-head">
        <span className="anno-glyph">{meta.glyph}</span>
        <span className="anno-label">{meta.label}</span>
        {signal.line && <span className="anno-line">L{signal.line}</span>}
      </div>
      <p className="anno-detail">{signal.detail}</p>
      {prose ? (
        <p className="anno-prose">{prose}</p>
      ) : (
        <button className="btn-explain" onClick={onExplain} disabled={loading}>
          {loading ? 'Asking guide…' : 'Explain'}
        </button>
      )}
    </li>
  )
}
