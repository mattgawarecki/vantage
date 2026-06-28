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
  !p.endsWith('.d.ts') && // type declarations — not runtime code
  !/\.(test|spec)\.[tj]sx?$/.test(p) && // test files
  !/(^|\/)(__tests__|__mocks__)\//.test(p) &&
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

  const entrypoints = detectEntrypoints(repoRoot, target, files, edges)
  const depth = bfsDepth(files, edges, entrypoints)
  const cycleCount = countCycles(files, edges)

  return { files, edges, entrypoints, depth, cycleCount }
}

function findTsConfig(repoRoot: string): string | null {
  // Prefer a config that actually declares compilerOptions.paths — in a Vite
  // scaffold tsconfig.json is a references-only stub and the aliases live in
  // tsconfig.app.json. Picking the stub mis-resolves aliases and orphans files.
  const existing = ['tsconfig.app.json', 'tsconfig.json']
    .map((n) => join(repoRoot, n))
    .filter(existsSync)
  for (const p of existing) {
    try {
      if (/"paths"\s*:/.test(readFileSync(p, 'utf8'))) return p
    } catch { /* unreadable */ }
  }
  return existing[0] ?? null
}

/** package.json `module`/`main` (+ `exports['.']`) resolved to a known file. */
function pkgEntry(repoRoot: string, dir: string, has: (rel: string) => boolean): string | null {
  const pkgPath = join(repoRoot, dir, 'package.json')
  if (!existsSync(pkgPath)) return null
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const exp = pkg.exports?.['.']
    const candidates = [
      pkg.module,
      pkg.main,
      typeof exp === 'string' ? exp : exp?.import ?? exp?.default,
    ]
    for (const c of candidates) {
      if (!c) continue
      const rel = join(dir, String(c).replace(/^\.\//, '')).replace(/^\.\//, '')
      if (has(rel)) return rel
    }
  } catch { /* malformed package.json */ }
  return null
}

/**
 * index.html <script> → common src entries → repo package.json → package-local
 * entry (target index / package.json) → orphan roots (preferring index.*).
 */
function detectEntrypoints(repoRoot: string, target: string, files: string[], edges: Edge[]): string[] {
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

  // 3. Repo-root package.json main/module.
  if (found.size === 0) {
    const e = pkgEntry(repoRoot, '.', has)
    if (e) found.add(e)
  }

  // 4. Package-local entry when a subdir is targeted (monorepo package / library):
  //    <target>/index.* and <target>/package.json main/module/exports.
  if (found.size === 0 && target && target !== '.') {
    for (const cand of ['index.tsx', 'index.ts', 'index.jsx', 'index.js']) {
      const rel = join(target, cand).replace(/^\.\//, '')
      if (found.size === 0 && has(rel)) found.add(rel)
    }
    if (found.size === 0) {
      const e = pkgEntry(repoRoot, target, has)
      if (e) found.add(e)
    }
  }

  // 5. Fallback: orphan roots (zero internal fan-in, non-trivial fan-out).
  //    Prefer index.*-named roots — a flat library exposes many unimported
  //    components, and treating all of them as entrypoints is noise.
  if (found.size === 0) {
    const inDeg = new Map<string, number>()
    const outDeg = new Map<string, number>()
    for (const e of edges) {
      inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
      outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1)
    }
    const roots = files.filter(
      (f) => (inDeg.get(f) ?? 0) === 0 && (outDeg.get(f) ?? 0) > 0,
    )
    const indexRoots = roots.filter((f) => /(^|\/)index\.(t|j)sx?$/.test(f))
    for (const f of indexRoots.length ? indexRoots : roots) found.add(f)
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

/**
 * Cheap cycle indicator: count of DFS back edges. Iterative (an explicit stack)
 * so a deep first-party graph can't overflow the call stack and crash analyze.
 */
function countCycles(files: string[], edges: Edge[]): number {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(e.to)
  }
  const state = new Map<string, 0 | 1 | 2>() // 0 unvisited, 1 in-stack, 2 done
  let back = 0
  for (const start of files) {
    if ((state.get(start) ?? 0) !== 0) continue
    const stack: { node: string; i: number }[] = [{ node: start, i: 0 }]
    state.set(start, 1)
    while (stack.length) {
      const frame = stack[stack.length - 1]
      const neighbors = adj.get(frame.node) ?? []
      if (frame.i < neighbors.length) {
        const m = neighbors[frame.i++]
        const s = state.get(m) ?? 0
        if (s === 1) back++
        else if (s === 0) { state.set(m, 1); stack.push({ node: m, i: 0 }) }
      } else {
        state.set(frame.node, 2)
        stack.pop()
      }
    }
  }
  return back
}
