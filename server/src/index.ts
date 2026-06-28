// Vantage API server. Runs the analyzer on demand, caches in memory,
// serves analysis slices, and proxies Claude for explain/ask.
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
import { analyze } from '@vantage/analyzer'
import type { Analysis, FileContent } from '@vantage/shared'
import { ask, explain, hasKey, setKey } from './llm.js'

// Load server/.env (gitignored) if present — Node 24 built-in, no dotenv dep.
try {
  if (existsSync(new URL('../.env', import.meta.url))) {
    process.loadEnvFile(new URL('../.env', import.meta.url))
  }
} catch { /* no .env — env may be set externally */ }

const PORT = Number(process.env.PORT ?? 8787)

interface State {
  analysis: Analysis | null
}
const state: State = { analysis: null }
const explainCache = new Map<string, string>()

const app = Fastify({ logger: true })
await app.register(cors, { origin: true })

app.get('/health', async () => ({ ok: true, hasKey: hasKey(), analyzed: !!state.analysis }))

// Set the Claude API key at runtime (playground). Stored in memory only.
app.post('/key', async (req, reply) => {
  const { apiKey } = (req.body ?? {}) as { apiKey?: string }
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return reply.code(400).send({ error: 'apiKey required' })
  }
  setKey(apiKey) // never logged
  app.log.info('API key set via UI')
  return { ok: true, hasKey: hasKey() }
})

app.post('/analyze', async (req, reply) => {
  const { path, target } = (req.body ?? {}) as { path?: string; target?: string }
  if (!path) return reply.code(400).send({ error: 'path required' })
  if (!existsSync(path)) return reply.code(404).send({ error: `not found: ${path}` })
  state.analysis = await analyze(path, { target })
  explainCache.clear()
  return { repoRoot: state.analysis.repoRoot, summary: state.analysis.summary }
})

// Native folder picker — the server is local, so it can open an OS dialog and
// return the chosen absolute path (browsers can't expose real FS paths).
app.post('/pick', async (_req, reply) => {
  if (process.platform !== 'darwin') {
    return reply.code(501).send({ error: 'native picker only on macOS; type the path' })
  }
  try {
    const { stdout } = await execFileP('osascript', [
      '-e',
      'POSIX path of (choose folder with prompt "Select a TypeScript/React repo")',
    ])
    return { path: stdout.trim() }
  } catch (e) {
    // osascript exits non-zero on cancel (-128).
    if (e instanceof Error && /-128|User canceled/.test(e.message)) {
      return { canceled: true }
    }
    return reply.code(500).send({ error: 'picker failed' })
  }
})

app.get('/analysis', async (_req, reply) => {
  if (!state.analysis) return reply.code(409).send({ error: 'no analysis — POST /analyze first' })
  return state.analysis
})

app.get('/file', async (req, reply) => {
  if (!state.analysis) return reply.code(409).send({ error: 'no analysis' })
  const { path } = req.query as { path?: string }
  if (!path) return reply.code(400).send({ error: 'path required' })
  const abs = join(state.analysis.repoRoot, path)
  if (!abs.startsWith(state.analysis.repoRoot)) {
    return reply.code(400).send({ error: 'path escapes repo' })
  }
  try {
    const source = readFileSync(abs, 'utf8')
    const content: FileContent = { path, source, language: languageOf(path) }
    return content
  } catch {
    return reply.code(404).send({ error: `cannot read ${path}` })
  }
})

app.post('/explain', async (req, reply) => {
  if (!state.analysis) return reply.code(409).send({ error: 'no analysis' })
  const { path, line } = (req.body ?? {}) as { path?: string; line?: number }
  if (!path) return reply.code(400).send({ error: 'path required' })
  const key = `${path}:${line ?? '-'}`
  const cached = explainCache.get(key)
  if (cached) return { text: cached, cached: true }
  try {
    const { text, usage } = await explain(state.analysis, path, line)
    explainCache.set(key, text)
    app.log.info({ usage }, `explain ${key}`)
    return { text, cached: false }
  } catch (e) {
    return reply.code(e instanceof Error && e.message === 'no-key' ? 503 : 500)
      .send({ error: 'explain failed — is ANTHROPIC_API_KEY set?' })
  }
})

app.post('/ask', async (req, reply) => {
  if (!state.analysis) return reply.code(409).send({ error: 'no analysis' })
  const { path, question } = (req.body ?? {}) as { path?: string; question?: string }
  if (!path || !question) return reply.code(400).send({ error: 'path and question required' })
  try {
    const { text, usage } = await ask(state.analysis, path, question)
    app.log.info({ usage }, `ask ${path}`)
    return { text }
  } catch (e) {
    return reply.code(e instanceof Error && e.message === 'no-key' ? 503 : 500)
      .send({ error: 'ask failed — is ANTHROPIC_API_KEY set?' })
  }
})

function languageOf(path: string): string {
  switch (extname(path)) {
    case '.ts': case '.mts': case '.cts': return 'typescript'
    case '.tsx': return 'typescript'
    case '.js': case '.jsx': case '.mjs': return 'javascript'
    case '.json': return 'json'
    case '.css': return 'css'
    case '.md': return 'markdown'
    default: return 'plaintext'
  }
}

// Optional: analyze a repo on boot when REPO_PATH is set.
if (process.env.REPO_PATH && existsSync(process.env.REPO_PATH)) {
  app.log.info(`analyzing REPO_PATH=${process.env.REPO_PATH}`)
  state.analysis = await analyze(process.env.REPO_PATH, { target: process.env.REPO_TARGET })
  app.log.info(`analyzed ${state.analysis.nodes.length} files`)
}

app.listen({ port: PORT, host: '127.0.0.1' })
  .then(() => app.log.info(`Vantage server on http://127.0.0.1:${PORT} (key: ${hasKey()})`))
  .catch((err) => { app.log.error(err); process.exit(1) })
