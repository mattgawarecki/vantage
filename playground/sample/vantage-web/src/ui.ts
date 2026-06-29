// Small presentation helpers shared across components.
import type { SignalKind } from '@vantage/shared'

export const SIGNAL_META: Record<SignalKind, { label: string; glyph: string }> = {
  'high-fan-in': { label: 'Load-bearing', glyph: '🪨' },
  'complex-state': { label: 'Complex state', glyph: '🌀' },
  'boundary-crossing': { label: 'Boundary crossing', glyph: '🌉' },
  recency: { label: 'Recent activity', glyph: '🔥' },
  'dynamic-import': { label: 'Lazy / dynamic', glyph: '⚡' },
}

/** Score band used for the interestingness dot + (future) heat map. */
export function scoreBand(score: number): 'low' | 'mid' | 'high' {
  if (score >= 0.66) return 'high'
  if (score >= 0.33) return 'mid'
  return 'low'
}

/** Depth label. Entrypoint (0) is the summit; deeper descends. null = off-trail. */
export function depthLabel(depth: number | null): string {
  if (depth === null) return 'off-trail'
  if (depth === 0) return '⛰ summit'
  return `▼ ${depth}`
}
