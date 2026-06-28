// Claude integration for /explain and /ask, plus the shared context builder.
// Static analysis finds + ranks; Claude writes the prose (hybrid approach).
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Analysis, FileNode } from '@vantage/shared'

const EXPLAIN_MODEL = process.env.VANTAGE_EXPLAIN_MODEL ?? 'claude-opus-4-8'
const ASK_MODEL = process.env.VANTAGE_ASK_MODEL ?? 'claude-opus-4-8'
const MAX_NEIGHBORS = 5
const MAX_FILE_CHARS = 6000

let client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic()
  return client
}

export function hasKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

function readSlice(repoRoot: string, rel: string): string {
  try {
    return readFileSync(join(repoRoot, rel), 'utf8').slice(0, MAX_FILE_CHARS)
  } catch {
    return ''
  }
}

/** Neighbors = graph deps + dependents, capped by interestingness score. */
function neighbors(analysis: Analysis, path: string): FileNode[] {
  const ids = new Set<string>()
  for (const e of analysis.edges) {
    if (e.from === path) ids.add(e.to)
    if (e.to === path) ids.add(e.from)
  }
  return analysis.nodes
    .filter((n) => ids.has(n.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_NEIGHBORS)
}

function signalSummary(node: FileNode | undefined): string {
  if (!node || node.signals.length === 0) return '(no notable signals)'
  return node.signals
    .map((s) => `- ${s.kind}${s.line ? ` (L${s.line})` : ''}: ${s.detail}`)
    .join('\n')
}

function dependentsOf(analysis: Analysis, path: string): string[] {
  return analysis.edges.filter((e) => e.to === path && !e.typeOnly).map((e) => e.from)
}
function dependenciesOf(analysis: Analysis, path: string): string[] {
  return analysis.edges.filter((e) => e.from === path).map((e) => e.to)
}

/** Numbered code windows around the given 1-based lines (±pad), merged, with gaps marked. */
function codeWindow(source: string, lines: number[], pad = 6): string {
  const all = source.split('\n')
  if (lines.length === 0) {
    return all.slice(0, 60).map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n')
  }
  const keep = new Set<number>()
  for (const ln of lines) {
    for (let i = Math.max(1, ln - pad); i <= Math.min(all.length, ln + pad); i++) keep.add(i)
  }
  const sorted = [...keep].sort((a, b) => a - b)
  const out: string[] = []
  let prev = 0
  for (const ln of sorted) {
    if (prev && ln > prev + 1) out.push('     …')
    const mark = lines.includes(ln) ? '►' : ' '
    out.push(`${mark}${String(ln).padStart(4)}| ${all[ln - 1]}`)
    prev = ln
  }
  return out.join('\n')
}

interface LlmResult { text: string; usage: Anthropic.Messages.Usage }

export async function explain(
  analysis: Analysis,
  path: string,
  line?: number,
): Promise<LlmResult> {
  const c = getClient()
  if (!c) throw new Error('no-key')
  const node = analysis.nodes.find((n) => n.id === path)
  const focused = line ? node?.signals.find((s) => s.line === line) : undefined

  // Lines to spotlight: the focused signal's lines, else every signal line on the file.
  const focusLines = focused
    ? focused.lines ?? (focused.line ? [focused.line] : [])
    : (node?.signals.flatMap((s) => s.lines ?? (s.line ? [s.line] : [])) ?? [])

  const fullSource = readFileSync(join(analysis.repoRoot, path), 'utf8')
  const deps = dependenciesOf(analysis, path)
  const dependents = dependentsOf(analysis, path)
  const depthDesc =
    node?.depth == null
      ? 'off-trail (not reachable from an entrypoint)'
      : node.depth === 0
        ? 'an entrypoint (summit, depth 0)'
        : `depth ${node.depth} from the nearest entrypoint`

  const system =
    'You are Vantage, a code-orienteering guide for an engineer getting their bearings in an ' +
    'unfamiliar TypeScript/React codebase. A static analyzer flagged a "trail marker" — your job is ' +
    'to orient the newcomer on it. Be specific and grounded in the exact code shown (refer to real ' +
    'identifiers, not generic advice). Cover, briefly and only where relevant:\n' +
    '1. What this code actually does.\n' +
    '2. Why it was flagged / why it is worth a newcomer\'s attention.\n' +
    '3. How it connects — who depends on it and what it reaches into.\n' +
    '4. What to read next to understand it.\n' +
    'Aim for a tight paragraph or a few short bullets. No preamble, no restating the question.'

  const user =
    `Repo: ${analysis.summary.framework} at ${analysis.repoRoot}\n` +
    `File: ${path}  —  ${depthDesc}, interestingness ${node?.score.toFixed(2) ?? '?'}\n\n` +
    `Flagged${focused ? ` (focus: ${focused.kind})` : ''}:\n` +
    `${focused ? `- ${focused.kind}${focused.line ? ` (L${focused.line})` : ''}: ${focused.detail}` : ''}\n` +
    `All signals on this file:\n${signalSummary(node)}\n\n` +
    `Imported by (${dependents.length}): ${dependents.slice(0, 10).join(', ') || '(nothing internal)'}\n` +
    `Imports (${deps.length}): ${deps.slice(0, 10).join(', ') || '(no internal deps)'}\n\n` +
    `Code (► marks flagged lines):\n\`\`\`tsx\n${codeWindow(fullSource, focusLines)}\n\`\`\``

  const res = await c.messages.create({
    model: EXPLAIN_MODEL,
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  })
  return { text: textOf(res), usage: res.usage }
}

export async function ask(
  analysis: Analysis,
  path: string,
  question: string,
): Promise<LlmResult> {
  const c = getClient()
  if (!c) throw new Error('no-key')
  const node = analysis.nodes.find((n) => n.id === path)
  const nbrs = neighbors(analysis, path)

  const system =
    'You are Vantage, a code-orienteering guide helping an engineer get their bearings in an ' +
    'unfamiliar TypeScript/React codebase. Answer the question using ONLY the provided code and ' +
    'signals; if the answer is not present, say what you can infer and what you would open next. ' +
    'Be concise and concrete. Final answer only.'

  const neighborBlocks = nbrs
    .map(
      (n) =>
        `--- ${n.id} (depth ${n.depth ?? 'off-trail'}, score ${n.score.toFixed(2)}) ---\n` +
        `${readSlice(analysis.repoRoot, n.id)}`,
    )
    .join('\n\n')

  const user =
    `Current file: ${path}\n` +
    `Signals here:\n${signalSummary(node)}\n\n` +
    `Source:\n\`\`\`tsx\n${readSlice(analysis.repoRoot, path)}\n\`\`\`\n\n` +
    `Graph neighbors (deps + dependents):\n${neighborBlocks || '(none)'}\n\n` +
    `Question: ${question}`

  const res = await c.messages.create({
    model: ASK_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  })
  return { text: textOf(res), usage: res.usage }
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}
