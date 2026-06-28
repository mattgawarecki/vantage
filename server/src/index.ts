// Vantage API server. Runs the analyzer on demand, caches in memory,
// serves analysis slices, and proxies Claude for explain/ask.
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve, relative, isAbsolute } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

/** Resolve `p` within `root`; null if it escapes (blocks ../ + absolute paths). */
function containedPath(root: string, p: string): string | null {
  const abs = resolve(root, p)
  const rel = relative(root, abs)
  return !rel.startsWith('..') && !isAbsolute(rel) ? abs : null
}
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
// Playground mode: lock to a single bundled repo (REPO_PATH). Disables
// /analyze and /pick so a public deployment can't be repointed at the host FS.
const PLAYGROUND = /^(1|true)$/i.test(process.env.PLAYGROUND ?? '')

interface State {
  analysis: Analysis | null
}
const state: State = { analysis: null }
const explainCache = new Map<string, string>()

const app = Fastify({ logger: true })
// Lock CORS to known origins in deployment via CORS_ORIGIN (comma-separated);
// reflect any origin only in local dev (default).
const corsOrigin = process.env.CORS_ORIGIN
await app.register(cors, {
  origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
})

app.get('/health', async () => ({
  ok: true,
  hasKey: hasKey(),
  analyzed: !!state.analysis,
  playground: PLAYGROUND,
}))

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
  if (PLAYGROUND) return reply.code(403).send({ error: 'disabled in playground mode' })
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
  if (PLAYGROUND) return reply.code(403).send({ error: 'disabled in playground mode' })
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
  const abs = containedPath(state.analysis.repoRoot, path)
  if (!abs) return reply.code(400).send({ error: 'path escapes repo' })
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
  if (!containedPath(state.analysis.repoRoot, path)) {
    return reply.code(400).send({ error: 'path escapes repo' })
  }
  const key = `${path}:${line ?? '-'}`
  const cached = explainCache.get(key)
  if (cached) return { text: cached, cached: true }
  try {
    const { text, usage } = await explain(state.analysis, path, line)
    app.log.info({ usage }, `explain ${key}`)
    if (!text.trim()) return reply.code(502).send({ error: 'empty explanation — try again' })
    explainCache.set(key, text)
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
  if (!containedPath(state.analysis.repoRoot, path)) {
    return reply.code(400).send({ error: 'path escapes repo' })
  }
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
