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
          <Stat label="Files" value={summary.fileCount} />
          <Stat label="Framework" value={summary.framework} />
          <Stat label="Entrypoints" value={summary.entrypoints.join(', ') || '—'} />
          <Stat label="Orphans" value={summary.orphanCount} hot={summary.orphanCount > 0} />
          <Stat label="Cycles" value={summary.cycleCount} hot={summary.cycleCount > 0} />
          <Stat label="Top dirs" value={summary.topDirs.join(', ') || '—'} />
        </div>
        {summary.warnings.length > 0 && (
          <p className="summary-warn">⚠ {summary.warnings.length} parse warning(s) skipped</p>
        )}
        <button className="btn-enter" onClick={onDismiss}>Start exploring →</button>
      </div>
    </div>
  )
}

function Stat({ label, value, hot }: { label: string; value: string | number; hot?: boolean }) {
  return (
    <div className={`stat${hot ? ' hot' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
