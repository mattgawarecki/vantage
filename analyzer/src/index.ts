// Vantage analyzer — repoPath -> Analysis.
// Pipeline: dependency-cruiser graph -> ts-morph signals -> scoring -> summary.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Analysis, FileNode, RepoSummary, Signal, SignalKind } from '@vantage/shared'
import { buildGraph } from './graph.js'
import { analyzeFile, makeProject } from './signals.js'

export interface AnalyzeOptions {
  /** Subdir to cruise (relative to repoRoot). Defaults to src/ or repo root. */
  target?: string
}

const WEIGHTS: Record<SignalKind, number> = {
  'high-fan-in': 1.0,
  'complex-state': 0.8,
  'boundary-crossing': 0.8,
  recency: 0.6,
  'dynamic-import': 0.5,
}

export async function analyze(repoRoot: string, opts: AnalyzeOptions = {}): Promise<Analysis> {
  const target = opts.target ?? pickTarget(repoRoot)
  const graph = await buildGraph(repoRoot, target)

  const dynamicFiles = new Set(graph.edges.filter((e) => e.dynamic).map((e) => e.from))
  const fanIn = new Map<string, number>()
  for (const e of graph.edges) {
    if (!e.typeOnly) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1)
  }

  // --- per-file signal pass (one shared ts-morph project, AST freed per file) ---
  const project = makeProject()
  const warnings: string[] = []
  const perFile = new Map<string, { loc: number; mtimeMs: number; branch: number; signals: Signal[] }>()
  for (const rel of graph.files) {
    const st = analyzeFile(project, repoRoot, rel, dynamicFiles.has(rel))
    if (st.parseError) warnings.push(`${rel}: parse skipped`)
    perFile.set(rel, { loc: st.loc, mtimeMs: st.mtimeMs, branch: st.branchCount, signals: st.signals })
  }

  // --- aggregate-dependent signals: high-fan-in (gated) + recency ---
  const mtimes = [...perFile.values()].map((v) => v.mtimeMs).filter((m) => m > 0).sort((a, b) => a - b)
  const recentCut = mtimes.length ? mtimes[Math.floor(mtimes.length * 0.85)] : Infinity
  const fanVals = [...fanIn.values()].sort((a, b) => a - b)
  const fanCut = Math.max(4, fanVals.length ? fanVals[Math.floor(fanVals.length * 0.8)] : 4)

  const nodes: FileNode[] = []
  const raw = new Map<string, number>()
  for (const rel of graph.files) {
    const f = perFile.get(rel)!
    const signals = [...f.signals]

    const fi = fanIn.get(rel) ?? 0
    const passesComplexityGate = f.loc >= 30 && f.branch >= 3
    if (fi >= fanCut && passesComplexityGate) {
      signals.push({
        kind: 'high-fan-in',
        detail: `${fi} internal dependents and non-trivial logic`,
        severity: Math.min(1, fi / (fanCut * 2)),
      })
    }
    if (f.mtimeMs > 0 && f.mtimeMs >= recentCut) {
      signals.push({ kind: 'recency', detail: 'Recently modified — active work', severity: 0.6 })
    }

    const rawScore = signals.reduce((s, sig) => s + WEIGHTS[sig.kind] * sig.severity, 0)
    raw.set(rel, rawScore)
    nodes.push({
      id: rel,
      depth: graph.depth.get(rel) ?? null,
      loc: f.loc,
      mtimeMs: f.mtimeMs,
      signals,
      score: 0,
    })
  }

  // Normalize raw scores to 0..1 by percentile rank (outlier-robust).
  const sorted = [...raw.values()].sort((a, b) => a - b)
  for (const n of nodes) n.score = percentileRank(sorted, raw.get(n.id)!)

  const summary = buildSummary(repoRoot, nodes, graph.cycleCount, warnings)
  return { repoRoot, entrypoints: graph.entrypoints, nodes, edges: graph.edges, summary }
}

function pickTarget(repoRoot: string): string {
  return existsSync(join(repoRoot, 'src')) ? 'src' : '.'
}

function percentileRank(sortedAsc: number[], value: number): number {
  if (sortedAsc.length <= 1) return value > 0 ? 1 : 0
  let count = 0
  for (const v of sortedAsc) if (v <= value) count++
  return count / sortedAsc.length
}

function buildSummary(
  repoRoot: string,
  nodes: FileNode[],
  cycleCount: number,
  warnings: string[],
): RepoSummary {
  const dirCounts = new Map<string, number>()
  for (const n of nodes) {
    const parts = n.id.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1)
  }
  const topDirs = [...dirCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((d) => d[0])
  const entrypoints = nodes.filter((n) => n.depth === 0).map((n) => n.id)
  return {
    fileCount: nodes.length,
    topDirs,
    framework: detectFramework(repoRoot),
    entrypoints,
    orphanCount: nodes.filter((n) => n.depth === null).length,
    cycleCount,
    warnings,
  }
}

function detectFramework(repoRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps.next) return 'Next.js'
    if (deps.react && deps.vite) return 'React + Vite'
    if (deps.react) return 'React'
    return 'TypeScript'
  } catch {
    return 'TypeScript'
  }
}
