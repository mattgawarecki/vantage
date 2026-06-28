import { useState } from 'react'
import type { Signal } from '@vantage/shared'
import { SIGNAL_META } from '../ui'
import { explain } from '../api'
import { Markdown } from './Markdown'

interface Props {
  path: string | null
  signals: Signal[]
  activeLine: number | null
  onJump: (line: number) => void
  hasKey: boolean
  onRequestKey: () => void
}

export function AnnotationsPanel({ path, signals, activeLine, onJump, hasKey, onRequestKey }: Props) {
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
          onJump={onJump}
          hasKey={hasKey}
          onRequestKey={onRequestKey}
        />
      ))}
    </ul>
  )
}

function AnnotationCard({ path, signal, active, onJump, hasKey, onRequestKey }: {
  path: string; signal: Signal; active: boolean; onJump: (line: number) => void
  hasKey: boolean; onRequestKey: () => void
}) {
  const meta = SIGNAL_META[signal.kind]
  const [prose, setProse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onExplain() {
    setLoading(true)
    setProse(await explain(path, signal.line))
    setLoading(false)
  }

  const jumpable = typeof signal.line === 'number'
  return (
    <li
      className={`anno${active ? ' is-active' : ''}${jumpable ? ' is-jumpable' : ''}`}
      onClick={() => jumpable && onJump(signal.line!)}
      title={jumpable ? `Jump to line ${signal.line}` : undefined}
    >
      <div className="anno-head">
        <span className="anno-glyph">{meta.glyph}</span>
        <span className="anno-label">{meta.label}</span>
        {signal.line && <span className="anno-line">L{signal.line}</span>}
      </div>
      <p className="anno-detail">{signal.detail}</p>
      {prose ? (
        <div className="anno-prose"><Markdown>{prose}</Markdown></div>
      ) : hasKey ? (
        <button
          className="btn-explain"
          onClick={(e) => { e.stopPropagation(); onExplain() }}
          disabled={loading}
        >
          {loading ? 'Asking guide…' : 'Explain'}
        </button>
      ) : (
        <button
          className="btn-explain btn-needkey"
          onClick={(e) => { e.stopPropagation(); onRequestKey() }}
          title="Explain needs a Claude API key"
        >
          🔑 Set API key to explain
        </button>
      )}
    </li>
  )
}
