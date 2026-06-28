// Module graph: run dependency-cruiser, build first-party nodes + edges,
// detect entrypoints, and compute depth via BFS (dynamic edges included).
import { cruise, type ICruiseOptions } from 'dependency-cruiser'
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Edge } from '@vantage/shared'

interface RawDep {
  resolved: string
  dynamic?: boolean
  dependencyTypes?: string[]
  couldNotResolve?: boolean
  coreModule?: boolean
}
interface RawModule {
  source: string
  dependencies: RawDep[]
  orphan?: boolean
}

export interface GraphResult {
  files: string[]
  edges: Edge[]
  entrypoints: string[]
  /** path -> depth (min hops from any entrypoint), or null if unreachable. */
  depth: Map<string, number | null>
  cycleCount: number
}

const isFirstParty = (p: string) =>
  !p.includes('node_modules') &&
  !p.startsWith('..') && // outside repo root (e.g. sibling workspace via symlink)
  /\.(ts|tsx|js|jsx|mts|cts)$/.test(p)

export async function buildGraph(repoRoot: string, target: string): Promise<GraphResult> {
  const tsConfigPath = findTsConfig(repoRoot)
  const options: ICruiseOptions = {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|\\.test\\.|\\.spec\\.|__tests__|dist|build)' },
    tsPreCompilationDeps: true,
  }

  // dependency-cruiser emits module sources relative to cwd; run from repoRoot.
  const prevCwd = process.cwd()
  let modules: RawModule[]
  try {
    process.chdir(repoRoot)
    const result = await cruise(
      [target],
      options,
      undefined,
      tsConfigPath ? { tsConfig: extractTSConfig(tsConfigPath) } : undefined,
    )
    const output =
      typeof result.output === 'string' ? JSON.parse(result.output) : result.output
    modules = (output.modules ?? []) as RawModule[]
  } finally {
    process.chdir(prevCwd)
  }

  const files: string[] = []
  const edges: Edge[] = []
  const fileSet = new Set<string>()

  for (const m of modules) {
    if (!isFirstParty(m.source)) continue
    if (!fileSet.has(m.source)) { fileSet.add(m.source); files.push(m.source) }
    for (const d of m.dependencies) {
      if (d.couldNotResolve || d.coreModule) continue
      if (!isFirstParty(d.resolved)) continue
      edges.push({
        from: m.source,
        to: d.resolved,
        dynamic: !!d.dynamic,
        typeOnly: (d.dependencyTypes ?? []).includes('type-only'),
      })
    }
  }
  // Ensure every edge endpoint is a known node.
  for (const e of edges) {
    if (!fileSet.has(e.to)) { fileSet.add(e.to); files.push(e.to) }
  }

  const entrypoints = detectEntrypoints(repoRoot, files, edges)
  const depth = bfsDepth(files, edges, entrypoints)
  const cycleCount = countCycles(files, edges)

  return { files, edges, entrypoints, depth, cycleCount }
}

function findTsConfig(repoRoot: string): string | null {
  for (const name of ['tsconfig.json', 'tsconfig.app.json']) {
    const p = join(repoRoot, name)
    if (existsSync(p)) return p
  }
  return null
}

/** index.html <script> → main.tsx, then package.json, then orphan roots. */
function detectEntrypoints(repoRoot: string, files: string[], edges: Edge[]): string[] {
  const found = new Set<string>()
  const has = (rel: string) => files.includes(rel)

  // 1. Vite index.html script tag.
  const indexHtml = join(repoRoot, 'index.html')
  if (existsSync(indexHtml)) {
    const html = readFileSync(indexHtml, 'utf8')
    const m = html.match(/<script[^>]+src=["']\.?\/?([^"']+\.(?:t|j)sx?)["']/)
    if (m && has(m[1])) found.add(m[1])
  }

  // 2. Common React entry filenames.
  for (const cand of ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts']) {
    if (found.size === 0 && has(cand)) found.add(cand)
  }

  // 3. package.json main/module.
  const pkgPath = join(repoRoot, 'package.json')
  if (found.size === 0 && existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      for (const field of ['module', 'main']) {
        const rel = pkg[field]?.replace(/^\.\//, '')
        if (rel && has(rel)) found.add(rel)
      }
    } catch { /* ignore malformed package.json */ }
  }

  // 4. Fallback: orphan roots — zero internal fan-in, non-trivial fan-out.
  if (found.size === 0) {
    const inDeg = new Map<string, number>()
    const outDeg = new Map<string, number>()
    for (const e of edges) {
      inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
      outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1)
    }
    for (const f of files) {
      if ((inDeg.get(f) ?? 0) === 0 && (outDeg.get(f) ?? 0) > 0) found.add(f)
    }
  }
  return [...found]
}

/** BFS from entrypoints along out-edges (dynamic included). Unreached = null. */
function bfsDepth(files: string[], edges: Edge[], entrypoints: string[]): Map<string, number | null> {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(e.to)
  }
  const depth = new Map<string, number | null>()
  for (const f of files) depth.set(f, null)
  const queue: string[] = []
  for (const ep of entrypoints) { depth.set(ep, 0); queue.push(ep) }
  while (queue.length) {
    const cur = queue.shift()!
    const d = depth.get(cur)!
    for (const next of adj.get(cur) ?? []) {
      if (depth.get(next) === null) { depth.set(next, (d ?? 0) + 1); queue.push(next) }
    }
  }
  return depth
}

/** Cheap cycle count via DFS back-edge detection (number of back edges). */
function countCycles(files: string[], edges: Edge[]): number {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(e.to)
  }
  const state = new Map<string, 0 | 1 | 2>() // 0 unvisited, 1 in-stack, 2 done
  let back = 0
  const visit = (n: string) => {
    state.set(n, 1)
    for (const m of adj.get(n) ?? []) {
      const s = state.get(m) ?? 0
      if (s === 1) back++
      else if (s === 0) visit(m)
    }
    state.set(n, 2)
  }
  for (const f of files) if ((state.get(f) ?? 0) === 0) visit(f)
  return back
}
