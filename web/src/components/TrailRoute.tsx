import { useState } from 'react'
import type { Analysis, FileNode } from '@vantage/shared'
import { SIGNAL_META, depthLabel } from '../ui'

interface Props {
  analysis: Analysis
  selected: string | null
  onSelect: (path: string) => void
}

type Strategy = 'descent' | 'complexity' | 'feature'
interface Stop { node: FileNode; label: string }

const STOPS = 8
const dkey = (d: number | null) => (d == null ? Number.MAX_SAFE_INTEGER : d)
const short = (p: string) => p.split('/').slice(-2).join('/')

const STRATEGIES: { id: Strategy; label: string; blurb: string }[] = [
  { id: 'descent', label: 'Descent', blurb: 'Start at the summit, descend through landmarks.' },
  { id: 'complexity', label: 'Complexity', blurb: 'The gnarliest, most signal-dense code first.' },
  { id: 'feature', label: 'By area', blurb: 'The standout file in each region of the codebase.' },
]

function topSignalLabel(node: FileNode): string {
  const top = [...node.signals].sort((a, b) => b.severity - a.severity)[0]
  return top ? `${SIGNAL_META[top.kind].glyph} ${SIGNAL_META[top.kind].label}` : ''
}

function buildRoute(analysis: Analysis, strategy: Strategy): Stop[] {
  const entry = analysis.entrypoints[0]
  const markers = analysis.nodes.filter((n) => n.signals.length > 0)

  if (strategy === 'complexity') {
    return markers
      .filter((n) => n.id !== entry)
      .sort((a, b) => b.score - a.score)
      .slice(0, STOPS)
      .map((node) => ({ node, label: topSignalLabel(node) }))
  }

  if (strategy === 'feature') {
    const byDir = new Map<string, FileNode[]>()
    for (const n of markers) {
      const dir = n.id.split('/').slice(0, -1).join('/') || '.'
      const arr = byDir.get(dir) ?? []
      arr.push(n)
      byDir.set(dir, arr)
    }
    return [...byDir.entries()]
      .map(([dir, ns]) => ({
        dir,
        rep: [...ns].sort((a, b) => b.score - a.score)[0],
        sum: ns.reduce((s, x) => s + x.score, 0),
      }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, STOPS)
      .map(({ dir, rep }) => ({ node: rep, label: `📁 ${short(dir)} · ${topSignalLabel(rep)}` }))
  }

  // descent
  const start = analysis.nodes.find((n) => n.id === entry)
  const ms = markers
    .filter((n) => n.id !== entry)
    .sort((a, b) => dkey(a.depth) - dkey(b.depth) || b.score - a.score)
    .slice(0, STOPS - (start ? 1 : 0))
    .map((node) => ({ node, label: topSignalLabel(node) }))
  return start
    ? [{ node: start, label: '⛺ Trailhead — where the app starts' }, ...ms]
    : ms
}

export function TrailRoute({ analysis, selected, onSelect }: Props) {
  const [strategy, setStrategy] = useState<Strategy>('descent')
  const route = buildRoute(analysis, strategy)
  const blurb = STRATEGIES.find((s) => s.id === strategy)!.blurb

  return (
    <div className="route">
      <div className="route-tabs">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            className={`route-tab${strategy === s.id ? ' is-active' : ''}`}
            onClick={() => setStrategy(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="legend">{blurb}</p>

      {route.length === 0 ? (
        <p className="hint">No trail to chart — no markers found.</p>
      ) : (
        <ol className="route-list">
          {route.map(({ node, label }, i) => (
            <li key={node.id} className="route-stop">
              <span className="route-num">{i + 1}</span>
              <button
                className={`route-card${selected === node.id ? ' is-selected' : ''}`}
                onClick={() => onSelect(node.id)}
              >
                <span className="route-head">
                  <span className="route-name">{node.id.split('/').pop()}</span>
                  <span className="depth-badge">{depthLabel(node.depth)}</span>
                </span>
                <span className="route-why">{label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
