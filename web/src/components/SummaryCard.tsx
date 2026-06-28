import type { FileNode, RepoSummary } from '@vantage/shared'
import { SIGNAL_META } from '../ui'
import { Logo } from './Logo'

interface Props {
  summary: RepoSummary
  nodes: FileNode[]
  repoRoot: string
  live: boolean
  onDismiss: () => void
  onOpen: (path: string) => void
}

const short = (p: string) => p.split('/').slice(-2).join('/')

export function SummaryCard({ summary, nodes, repoRoot, live, onDismiss, onOpen }: Props) {
  const entries = summary.entrypoints.slice(0, 3)
  const markers = nodes
    .filter((n) => n.signals.length > 0 && !summary.entrypoints.includes(n.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  return (
    <div className="summary-overlay" onClick={onDismiss}>
      <div className="summary-card" onClick={(e) => e.stopPropagation()}>
        <header className="summary-head">
          <h2><Logo size={22} /> Trailhead</h2>
          <span className={`badge ${live ? 'live' : 'mock'}`}>
            {live ? 'live analysis' : 'sample data'}
          </span>
        </header>
        <p className="summary-root">{repoRoot}</p>
        <div className="summary-grid">
          <Stat label="Files" value={summary.fileCount}
            hint="First-party TypeScript/React source files in the analyzed graph (node_modules excluded)." />
          <Stat label="Framework" value={summary.framework}
            hint="Detected from package.json dependencies." />
          <Stat label="Entrypoints" value={summary.entrypoints.join(', ') || '—'}
            hint="Where the app starts — the summit (depth 0). Depth of every other file is measured from here." />
          <Stat label="Orphans" value={summary.orphanCount} hot={summary.orphanCount > 0}
            hint="Files unreachable from any entrypoint (off-trail) — often dead code, tests, or scripts not imported by the app." />
          <Stat label="Cycles" value={summary.cycleCount} hot={summary.cycleCount > 0}
            hint="Import cycles (A → B → … → A). Tangled dependencies that are harder to reason about and refactor safely." />
          <Stat label="Top dirs" value={summary.topDirs.join(', ') || '—'}
            hint="Directories holding the most source files — the main regions of the map." />
        </div>
        <div className="summary-start">
          <h3>Where to begin</h3>
          <ul className="start-list">
            {entries.map((ep) => (
              <li key={ep}>
                <button className="start-link" onClick={() => onOpen(ep)} title={ep}>
                  <span className="start-icon">⛰</span>
                  <span className="start-name">{short(ep)}</span>
                  <span className="start-tag">entrypoint</span>
                </button>
              </li>
            ))}
            {markers.map((m) => {
              const top = [...m.signals].sort((a, b) => b.severity - a.severity)[0]
              return (
                <li key={m.id}>
                  <button className="start-link" onClick={() => onOpen(m.id)} title={m.id}>
                    <span className="start-icon">{SIGNAL_META[top.kind].glyph}</span>
                    <span className="start-name">{short(m.id)}</span>
                    <span className="start-tag">{SIGNAL_META[top.kind].label}</span>
                  </button>
                </li>
              )
            })}
            {entries.length === 0 && markers.length === 0 && (
              <li className="hint">No standout landmarks — small or flat repo.</li>
            )}
          </ul>
        </div>

        {summary.warnings.length > 0 && (
          <p className="summary-warn">⚠ {summary.warnings.length} parse warning(s) skipped</p>
        )}
        <button className="btn-enter" onClick={onDismiss}>Start exploring →</button>
      </div>
    </div>
  )
}

function Stat({ label, value, hot, hint }: {
  label: string; value: string | number; hot?: boolean; hint?: string
}) {
  return (
    <div className={`stat${hot ? ' hot' : ''}`} title={hint}>
      <span className="stat-label">
        {label}
        {hint && <span className="stat-info" aria-hidden> ⓘ</span>}
      </span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
