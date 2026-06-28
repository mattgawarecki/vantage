// Per-file signal detection via ts-morph — syntactic only (no type-checker
// program), since every v1 signal is an AST query.
import { Project, SyntaxKind, type CallExpression, type SourceFile } from 'ts-morph'
import { join } from 'node:path'
import { statSync } from 'node:fs'
import type { Signal } from '@vantage/shared'

export interface FileStats {
  loc: number
  mtimeMs: number
  branchCount: number
  signals: Signal[]
  parseError?: string
}

const STATE_HOOKS = new Set(['useState', 'useReducer', 'useContext', 'useEffect'])
const BRANCH_KINDS = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.CatchClause,
])

export function makeProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true, jsx: 4 /* react-jsx */ },
  })
}

/** Detect per-file stats + signals. `dynamic` flags files with a dynamic import edge. */
export function analyzeFile(
  project: Project,
  repoRoot: string,
  rel: string,
  hasDynamicImport: boolean,
): FileStats {
  const abs = join(repoRoot, rel)
  const mtimeMs = safeMtime(abs)
  let sf: SourceFile
  try {
    sf = project.addSourceFileAtPath(abs)
  } catch (e) {
    return { loc: 0, mtimeMs, branchCount: 0, signals: [], parseError: String(e) }
  }

  const signals: Signal[] = []
  const loc = sf.getEndLineNumber()
  let branchCount = 0
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression)

  // complex-state: density of state hooks.
  const hookHits: { name: string; line: number }[] = []
  for (const call of calls) {
    const name = call.getExpression().getText().split('.').pop() ?? ''
    if (STATE_HOOKS.has(name)) {
      hookHits.push({ name, line: call.getStartLineNumber() })
    }
  }
  if (hookHits.length >= 4 || hookHits.some((h) => h.name === 'useReducer')) {
    const counts = tally(hookHits.map((h) => h.name))
    signals.push({
      kind: 'complex-state',
      line: hookHits[0].line,
      detail: `Dense state — ${formatCounts(counts)}`,
      severity: Math.min(1, hookHits.length / 6),
    })
  }

  // boundary-crossing: fetch/axios/'use server'.
  const boundary = findBoundary(sf, calls)
  if (boundary) signals.push(boundary)

  // dynamic-import: anchor to the import() / lazy() call when present.
  if (hasDynamicImport) {
    const line = findDynamicImportLine(sf)
    signals.push({
      kind: 'dynamic-import',
      line,
      detail: 'Dynamic / lazy import — code-split boundary',
      severity: 0.5,
    })
  }

  // branch count for the complexity gate (used by scoring, not a signal itself).
  for (const kind of BRANCH_KINDS) branchCount += sf.getDescendantsOfKind(kind).length

  // Free the AST — keep memory flat across a big repo.
  project.removeSourceFile(sf)

  return { loc, mtimeMs, branchCount, signals }
}

function findBoundary(sf: SourceFile, calls: CallExpression[]): Signal | null {
  // 'use server' / 'use client' directive.
  const first = sf.getStatements()[0]?.getText().trim()
  if (first === "'use server'" || first === '"use server"') {
    return { kind: 'boundary-crossing', line: 1, detail: "'use server' — server boundary", severity: 0.7 }
  }
  // fetch(...) or axios usage.
  for (const call of calls) {
    const text = call.getExpression().getText()
    const leaf = text.split('.').pop() ?? ''
    if (text === 'fetch' || leaf === 'fetch') {
      return { kind: 'boundary-crossing', line: call.getStartLineNumber(), detail: 'fetch() — implicit client→server call', severity: 0.8 }
    }
    if (text === 'axios' || text.startsWith('axios.')) {
      return { kind: 'boundary-crossing', line: call.getStartLineNumber(), detail: 'axios request — network boundary', severity: 0.7 }
    }
  }
  return null
}

function findDynamicImportLine(sf: SourceFile): number | undefined {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      return call.getStartLineNumber()
    }
  }
  // React.lazy(() => import(...)) — fall back to a `lazy(` call.
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if ((call.getExpression().getText().split('.').pop() ?? '') === 'lazy') {
      return call.getStartLineNumber()
    }
  }
  return undefined
}

function safeMtime(abs: string): number {
  try { return statSync(abs).mtimeMs } catch { return 0 }
}

function tally(names: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1)
  return m
}

function formatCounts(counts: Map<string, number>): string {
  return [...counts.entries()].map(([k, v]) => `${v} ${k}`).join(', ')
}
