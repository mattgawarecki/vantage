import type { RepoSummary } from '@vantage/shared'

interface Props {
  summary: RepoSummary
  repoRoot: string
  live: boolean
  onDismiss: () => void
}

export function SummaryCard({ summary, repoRoot, live, onDismiss }: Props) {
  return (
    <div className="summary-overlay" onClick={onDismiss}>
      <div className="summary-card" onClick={(e) => e.stopPropagation()}>
        <header className="summary-head">
          <h2>🧭 Trailhead</h2>
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
