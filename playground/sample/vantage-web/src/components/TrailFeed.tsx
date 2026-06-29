import type { FileNode } from '@vantage/shared'
import { SIGNAL_META, scoreBand } from '../ui'

interface Props {
  nodes: FileNode[]
  selected: string | null
  onSelect: (path: string) => void
}

export function TrailFeed({ nodes, selected, onSelect }: Props) {
  const ranked = nodes
    .filter((n) => n.signals.length > 0)
    .sort((a, b) => b.score - a.score)

  if (ranked.length === 0) {
    return <p className="hint">No trail markers — small repo or limited signal.</p>
  }

  return (
    <ul className="feed">
      {ranked.map((node) => {
        const top = [...node.signals].sort((a, b) => b.severity - a.severity)[0]
        return (
          <li key={node.id}>
            <button
              className={`feed-row${selected === node.id ? ' is-selected' : ''}`}
              onClick={() => onSelect(node.id)}
            >
              <span className="feed-head">
                <span className={`dot dot-${scoreBand(node.score)}`} />
                <span className="feed-name">{node.id.split('/').pop()}</span>
                <span className="feed-score">{node.score.toFixed(2)}</span>
              </span>
              <span className="feed-marker">
                {SIGNAL_META[top.kind].glyph} {SIGNAL_META[top.kind].label}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
