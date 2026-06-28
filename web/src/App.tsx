import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { analyzeRepo, getAnalysis, getFile, getHealth, setApiKey } from './api'
import { Sidebar } from './components/Sidebar'
import { CodeView } from './components/CodeView'
import { AnnotationsPanel } from './components/AnnotationsPanel'
import { AskPanel } from './components/AskPanel'
import { SummaryCard } from './components/SummaryCard'
import { RepoEntry } from './components/RepoEntry'
import { Logo } from './components/Logo'
import { KeyModal } from './components/KeyModal'

export default function App() {
  const queryClient = useQueryClient()
  const analysisQ = useQuery({ queryKey: ['analysis'], queryFn: getAnalysis })
  const [selected, setSelected] = useState<string | null>(null)
  const [pickedLine, setPickedLine] = useState<number | null>(null)
  const [reveal, setReveal] = useState<{ line: number; n: number } | null>(null)
  const [showSummary, setShowSummary] = useState(true)
  const [showEntry, setShowEntry] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)

  const healthQ = useQuery({ queryKey: ['health'], queryFn: getHealth })
  const hasKey = healthQ.data?.hasKey ?? false
  const keyMut = useMutation({
    mutationFn: setApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['health'] }),
  })

  const analysis = analysisQ.data?.data ?? undefined
  const status = analysisQ.data?.status
  const live = status === 'live'

  const analyzeMut = useMutation({
    mutationFn: ({ path, target }: { path: string; target?: string }) =>
      analyzeRepo(path, target),
    onSuccess: () => {
      setSelected(null)
      setShowEntry(false)
      setShowSummary(true)
      queryClient.invalidateQueries({ queryKey: ['analysis'] })
    },
  })

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
    setReveal(null)
  }

  function jumpToLine(line: number) {
    setPickedLine(line)
    setReveal((r) => ({ line, n: (r?.n ?? 0) + 1 }))
  }

  if (analysisQ.isLoading) {
    return <div className="boot">🧭 Charting the terrain…</div>
  }

  // Entry screen: server up but no repo loaded, or user chose to switch repos.
  if (status === 'empty' || showEntry) {
    return (
      <RepoEntry
        serverDown={status === 'mock'}
        onCancel={analysis ? () => setShowEntry(false) : undefined}
        onSubmit={async (path, target) => { await analyzeMut.mutateAsync({ path, target }) }}
      />
    )
  }

  if (!analysis) {
    return <div className="boot">🧭 No analysis. <button onClick={() => setShowEntry(true)}>Choose a repo</button></div>
  }

  const node = analysis.nodes.find((n) => n.id === selected)
  const signals = node?.signals ?? []
  const neighborCount = analysis.edges.filter(
    (e) => e.from === selected || e.to === selected,
  ).length

  return (
    <div className="app-shell">
      {showKey && (
        <KeyModal
          hasKey={hasKey}
          onSave={(k) => keyMut.mutateAsync(k)}
          onClose={() => setShowKey(false)}
        />
      )}
      {showSummary && (
        <SummaryCard
          summary={analysis.summary}
          nodes={analysis.nodes}
          repoRoot={analysis.repoRoot}
          live={live}
          onDismiss={() => setShowSummary(false)}
          onOpen={(p) => { open(p); setShowSummary(false) }}
        />
      )}

      <header className="topbar">
        <span className="brand"><Logo size={20} /> Vantage</span>
        <span className="repo">{analysis.repoRoot}</span>
        <span className={`badge ${live ? 'live' : 'mock'}`}>
          {live ? 'live' : 'sample'}
        </span>
        <div className="topbar-actions">
          <button onClick={() => setShowKey(true)} title={hasKey ? 'API key set' : 'No API key — Explain/Ask disabled'}>
            {hasKey ? '🔑' : '🔓'} Key
          </button>
          <button onClick={() => setShowEntry(true)}>Change repo</button>
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
              activeLine={pickedLine}
              reveal={reveal}
            />
          </div>
        </section>

        {panelOpen && (
          <section className="panel-col">
            <div className="panel-section">
              <h3>Trail markers</h3>
              <AnnotationsPanel path={selected} signals={signals} activeLine={pickedLine} onJump={jumpToLine} />
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
