import type { Analysis } from '@vantage/shared'

interface Props {
  analysis: Analysis
  selected: string | null
  onSelect: (path: string) => void
}

export function ElevationGauge({ analysis, selected, onSelect }: Props) {
  const node = analysis.nodes.find((n) => n.id === selected)
  const maxDepth = Math.max(
    1,
    ...analysis.nodes.map((n) => n.depth ?? 0),
  )

  const shallower = analysis.edges
    .filter((e) => e.to === selected)
    .map((e) => e.from)
  const deeper = analysis.edges
    .filter((e) => e.from === selected)
    .map((e) => e.to)

  return (
    <div className="elevation">
      <p className="legend">⛰ summit = entrypoint (0) · descend ▼ deeper into the valley</p>

      {node ? (
        node.depth === null ? (
          <p className="off-trail-note">
            <strong>{shortName(selected!)}</strong> is <em>off-trail</em> —
            unreachable from any entrypoint (orphan / dead code).
          </p>
        ) : (
          <div className="ramp">
            {Array.from({ length: maxDepth + 1 }, (_, d) => (
              <div
                key={d}
                className={`ramp-step${d === node.depth ? ' is-here' : ''}`}
                style={{ '--lvl': d / maxDepth } as React.CSSProperties}
              >
                <span className="ramp-num">{d === 0 ? '⛰0' : `▼${d}`}</span>
                {d === node.depth && (
                  <span className="ramp-you">you are here · {shortName(node.id)}</span>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="hint">Select a file to see its elevation.</p>
      )}

      <NeighborList title="↑ Toward entrypoint" ids={shallower} onSelect={onSelect} />
      <NeighborList title="↓ Toward leaves" ids={deeper} onSelect={onSelect} />
    </div>
  )
}

function NeighborList({ title, ids, onSelect }: {
  title: string; ids: string[]; onSelect: (p: string) => void
}) {
  if (ids.length === 0) return null
  return (
    <div className="neighbors">
      <h4>{title}</h4>
      {ids.map((id) => (
        <button key={id} className="neighbor" onClick={() => onSelect(id)}>
          {shortName(id)}
        </button>
      ))}
    </div>
  )
}

function shortName(path: string) {
  return path.split('/').slice(-2).join('/')
}
