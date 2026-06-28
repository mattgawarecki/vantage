// API client. Talks to the Fastify server when it's up; falls back to mock
// data so the UI is usable standalone during development.
import type { Analysis, FileContent } from '@vantage/shared'
import { mockAnalysis, mockSources } from './mock'

const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'

async function tryFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(BASE + path, init)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export type AnalysisStatus = 'live' | 'empty' | 'mock'
export interface AnalysisResult {
  data: Analysis | null
  status: AnalysisStatus
}

/** live = server has an analysis; empty = server up but no repo loaded; mock = server down. */
export async function getAnalysis(): Promise<AnalysisResult> {
  try {
    const res = await fetch(BASE + '/analysis')
    if (res.ok) return { data: (await res.json()) as Analysis, status: 'live' }
    if (res.status === 409) return { data: null, status: 'empty' }
    return { data: mockAnalysis, status: 'mock' }
  } catch {
    return { data: mockAnalysis, status: 'mock' }
  }
}

export interface AnalyzeResponse {
  repoRoot: string
  summary: Analysis['summary']
}

/** Point the server at a local repo. Throws with a readable message on failure. */
export async function analyzeRepo(path: string, target?: string): Promise<AnalyzeResponse> {
  const res = await fetch(BASE + '/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, target: target || undefined }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `analyze failed (${res.status})`)
  }
  return (await res.json()) as AnalyzeResponse
}

/** Open a native folder dialog via the local server. null = canceled/unavailable. */
export async function pickFolder(): Promise<string | null> {
  const res = await fetch(BASE + '/pick', { method: 'POST' })
  if (!res.ok) return null
  const body = (await res.json()) as { path?: string; canceled?: boolean }
  return body.path ?? null
}

export interface Health { hasKey: boolean; analyzed: boolean; playground: boolean }
export async function getHealth(): Promise<Health> {
  const r = await tryFetch<Health>('/health')
  return r ?? { hasKey: false, analyzed: false, playground: false }
}

/** Set the Claude API key on the server (in-memory). Throws on failure. */
export async function setApiKey(apiKey: string): Promise<void> {
  const res = await fetch(BASE + '/key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `failed to set key (${res.status})`)
  }
}

export async function getFile(path: string): Promise<FileContent> {
  const live = await tryFetch<FileContent>(`/file?path=${encodeURIComponent(path)}`)
  if (live) return live
  return (
    mockSources[path] ?? { path, language: 'plaintext', source: '// (no source)' }
  )
}

export async function explain(path: string, line?: number): Promise<string> {
  const res = await tryFetch<{ text: string }>('/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, line }),
  })
  if (res) return res.text
  return '⛺ Explanations need the server running with ANTHROPIC_API_KEY set. (Static trail marker shown above.)'
}

export async function ask(path: string, question: string): Promise<string> {
  const res = await tryFetch<{ text: string }>('/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, question }),
  })
  if (res) return res.text
  return '⛺ The Ask trail-guide needs the server running with ANTHROPIC_API_KEY set.'
}
