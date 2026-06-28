import { useState } from 'react'
import type { Analysis } from '@vantage/shared'
import { FileTree } from './FileTree'
import { ElevationGauge } from './ElevationGauge'
import { TrailFeed } from './TrailFeed'

type Tab = 'files' | 'elevation' | 'trail'

interface Props {
  analysis: Analysis
  selected: string | null
  onSelect: (path: string) => void
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'trail', label: 'Trail markers' },
]

export function Sidebar({ analysis, selected, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('files')
  return (
    <aside className="sidebar">
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'files' && (
          <FileTree nodes={analysis.nodes} selected={selected} onSelect={onSelect} />
        )}
        {tab === 'elevation' && (
          <ElevationGauge analysis={analysis} selected={selected} onSelect={onSelect} />
        )}
        {tab === 'trail' && (
          <TrailFeed nodes={analysis.nodes} selected={selected} onSelect={onSelect} />
        )}
      </div>
    </aside>
  )
}
