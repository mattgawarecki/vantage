import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAnalysis, getFile } from './api'
import { Sidebar } from './components/Sidebar'
import { CodeView } from './components/CodeView'
import { AnnotationsPanel } from './components/AnnotationsPanel'
import { AskPanel } from './components/AskPanel'
import { SummaryCard } from './components/SummaryCard'

export default function App() {
  const analysisQ = useQuery({ queryKey: ['analysis'], queryFn: getAnalysis })
  const [selected, setSelected] = useState<string | null>(null)
  const [pickedLine, setPickedLine] = useState<number | null>(null)
  const [showSummary, setShowSummary] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)

  const analysis = analysisQ.data?.data
  const live = analysisQ.data?.live ?? false

  // Auto-open the primary entrypoint once analysis arrives.
  useEffect(() => {
    if (analysis && !selected) {
      setSelected(analysis.entrypoints[0] ?? analysis.nodes[0]?.id ?? null)
    }
  }, [analysis, selected])

  const fileQ = useQuery({
    queryKey: ['file', selected],
    queryFn: () => getFile(selected!),
    enabled: !!selected,
  })

  function open(path: string) {
    setSelected(path)
    setPickedLine(null)
  }

  if (analysisQ.isLoading || !analysis) {
    return <div className="boot">🧭 Charting the terrain…</div>
  }

  const node = analysis.nodes.find((n) => n.id === selected)
  const signals = node?.signals ?? []
  const neighborCount = analysis.edges.filter(
    (e) => e.from === selected || e.to === selected,
  ).length

  return (
    <div className="app-shell">
      {showSummary && (
        <SummaryCard
          summary={analysis.summary}
          repoRoot={analysis.repoRoot}
          live={live}
          onDismiss={() => setShowSummary(false)}
        />
      )}

      <header className="topbar">
        <span className="brand">🧭 Vantage</span>
        <span className="repo">{analysis.repoRoot}</span>
        <span className={`badge ${live ? 'live' : 'mock'}`}>
          {live ? 'live' : 'sample'}
        </span>
        <div className="topbar-actions">
          <button onClick={() => setShowSummary(true)}>Trailhead</button>
          <button onClick={() => setSidebarOpen((v) => !v)}>
            {sidebarOpen ? '⟨ Sidebar' : 'Sidebar ⟩'}
          </button>
          <button onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? 'Markers ⟩' : '⟨ Markers'}
          </button>
        </div>
      </header>

      <main className="columns">
        {sidebarOpen && (
          <Sidebar analysis={analysis} selected={selected} onSelect={open} />
        )}

        <section className="editor-col">
          <div className="editor-path">{selected ?? 'no file'}</div>
          <div className="editor-wrap">
            <CodeView
              content={fileQ.data ?? null}
              signals={signals}
              onPickLine={setPickedLine}
            />
          </div>
        </section>

        {panelOpen && (
          <section className="panel-col">
            <div className="panel-section">
              <h3>Trail markers</h3>
              <AnnotationsPanel path={selected} signals={signals} activeLine={pickedLine} />
            </div>
            <div className="panel-section ask-wrap">
              <AskPanel path={selected} neighborCount={neighborCount} />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
