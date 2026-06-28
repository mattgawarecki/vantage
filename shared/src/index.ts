// Vantage shared types — the contract between analyzer, server, and web.
// See docs/superpowers/specs/2026-06-27-code-orientation-tool-design.md

/** Why a file is interesting. Drives the line-anchored trail markers. */
export type SignalKind =
  | 'high-fan-in'
  | 'complex-state'
  | 'boundary-crossing'
  | 'recency'
  | 'dynamic-import'

export interface Signal {
  kind: SignalKind
  /** 1-based editor line the marker anchors to (primary, used for the card + jump). */
  line?: number
  /** All contributing lines to highlight (e.g. every hook in complex-state). Defaults to [line]. */
  lines?: number[]
  /** Short static description shown on the annotation card. */
  detail: string
  /** 0..1 relative strength, feeds scoring + card emphasis. */
  severity: number
}

/** One source file in the dependency graph. */
export interface FileNode {
  /** Repo-relative path, also the node id. */
  id: string
  /** Min hops from any entrypoint; null = unreachable (off-trail). */
  depth: number | null
  loc: number
  mtimeMs: number
  signals: Signal[]
  /** Aggregate interestingness, 0..1. Ranks the trail-markers feed. */
  score: number
}

/** A directed import edge, from -> to. */
export interface Edge {
  from: string
  to: string
  /** Dynamic / async import (import(), React.lazy). Still traversed by depth BFS. */
  dynamic: boolean
  /** `import type` — excluded from fan-in scoring. */
  typeOnly: boolean
}

/** Terrain overview shown on load. */
export interface RepoSummary {
  fileCount: number
  topDirs: string[]
  framework: string
  entrypoints: string[]
  orphanCount: number
  cycleCount: number
  warnings: string[]
}

/** Full analysis of a repository. */
export interface Analysis {
  repoRoot: string
  entrypoints: string[]
  nodes: FileNode[]
  edges: Edge[]
  summary: RepoSummary
}

/** Source payload for the editor. */
export interface FileContent {
  path: string
  source: string
  language: string
}
