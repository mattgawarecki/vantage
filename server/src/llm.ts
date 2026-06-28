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
  return node.signals.map((s) => `- ${s.kind}: ${s.detail}`).join('\n')
}

export async function explain(
  analysis: Analysis,
  path: string,
  line?: number,
): Promise<string> {
  const c = getClient()
  if (!c) throw new Error('no-key')
  const node = analysis.nodes.find((n) => n.id === path)
  const signal = line ? node?.signals.find((s) => s.line === line) : undefined
  const source = readSlice(analysis.repoRoot, path)

  const system =
    'You are Vantage, a code-orienteering guide for engineers new to a TypeScript/React codebase. ' +
    'Explain why a flagged piece of code matters and what it does, in 2-4 sentences. ' +
    'Be concrete and grounded in the code shown. Final answer only — no preamble.'

  const user =
    `File: ${path}\n` +
    `Why it was flagged:\n${signal ? `- ${signal.kind}: ${signal.detail}` : signalSummary(node)}\n\n` +
    `Source:\n\`\`\`tsx\n${source}\n\`\`\`\n\n` +
    (line ? `Focus on line ${line}.` : 'Explain this file as an orientation landmark.')

  const res = await c.messages.create({
    model: EXPLAIN_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  })
  return textOf(res)
}

export async function ask(
  analysis: Analysis,
  path: string,
  question: string,
): Promise<string> {
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
  return textOf(res)
}

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}
