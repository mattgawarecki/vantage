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

export async function getAnalysis(): Promise<{ data: Analysis; live: boolean }> {
  const live = await tryFetch<Analysis>('/analysis')
  return live ? { data: live, live: true } : { data: mockAnalysis, live: false }
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
