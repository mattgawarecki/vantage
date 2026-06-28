# Vantage — Code Orientation Tool — Design

**Date:** 2026-06-27
**Status:** Approved (design); pending implementation plan

## Brand / metaphor

**Project name: Vantage.** The product is framed as **orienteering** through a
codebase — exploring unfamiliar code is pathfinding on a hike. The metaphor drives
naming and UI language:

- **Orienteering** — the overall goal: find your bearings in unknown terrain.
- **Elevation map** — the depth gauge. Depth from the entrypoint reads as
  elevation/terrain.
- **Trail markers** — the interesting-code annotations. Signals are markers along
  the trail worth stopping at.

Use this vocabulary in UI copy and component names where it reads naturally
(e.g. "elevation" for the depth tab, "trail markers" for annotations). Technical
identifiers in code/data model stay literal (`depth`, `Signal`) for clarity.

## Purpose

A web application that helps new engineers orient themselves in an existing
**TypeScript + React** codebase. It is a navigation and familiarity tool — not a
linter or bug finder. Two core strengths:

1. **Surface "interesting" code** — automatically point out the code worth a new
   engineer's attention, while suppressing boilerplate noise.
2. **Orient relative to a reference point** — show how deep the current code sits
   relative to a reference (usually an entrypoint) via a "depth gauge," plus its
   dependency neighborhood.

Scope is restricted to TypeScript/React repositories. v1 reads a **local repo
path**; remote git URLs are a possible later extension.

## Definition of "interesting"

Interesting = signal-dense, unusual, or structurally important code. Explicitly
**not** interesting: boilerplate — plain array iteration (`.map`/`.filter`),
simple presentational component trees, pure prop-drilling, trivial conditionals,
and trivial-but-popular utilities.

Signals are computed by static analysis, then optionally explained in prose by
Claude on demand.

### v1 signal set

| kind | static rule (v1) |
|---|---|
| `high-fan-in` | many **repo-internal** dependents **AND** clears a min-complexity bar (see edge cases) |
| `complex-state` | density of `useState` / `useReducer` / `useContext` / `useEffect`; flag dense clusters |
| `unclear-name` | single-char / abbreviated / generic identifiers (`data`, `tmp`, `foo`); export name vs file mismatch |
| `boundary-crossing` | implicit client↔server crossings — `fetch` / `axios` / `'use server'` / route handlers |
| `heavily-tested` | count of test files (`__tests__`, `*.test.*`, `*.spec.*`) referencing the module |
| `dynamic-import` | `import()`, `await import()`, `React.lazy(() => import())` — flagged via dependency-cruiser `dynamic:true` + ts-morph line anchor |

Deferred signals (post-v1): `heavily-documented` (comment-line ratio), `anomaly`
(breaks local convention, e.g. lone default-export among named, deep relative
`../../..` imports), symbol-level granularity.

### Scoring

Each file gets `score` (0..1) = weighted sum of signals **minus** boilerplate
anti-signals. `score` ranks the "interesting feed"; per-file `signals[]` drive
the line-anchored annotations.

### Edge cases for "highly used" code

- **Trivial popular utils are not interesting.** `high-fan-in` fires only when
  internal fan-in is high **and** the file clears a min-complexity gate
  (LOC / branching / real logic). A one-line `cn()` or `formatDate` used
  everywhere is infrastructure noise → suppressed, or demoted to a quiet
  "common util" tag rather than an interesting annotation.
  `score(high-fan-in) = f(internal_fanin) × complexity_gate`.
- **External packages never count.** dependency-cruiser excludes `node_modules`
  (`doNotFollow` + exclude). Fan-in counts only repo-internal dependents; imports
  of `react`, `lodash`, etc. are not nodes and do not inflate centrality. The
  graph is first-party code only.

## Architecture

Approach A: a thin API server runs the analyzer on demand and caches results;
the analyzer is an isolated, unit-testable module.

**Topology** — monorepo via npm workspaces:

```
analyzer/   Pure TS lib: repoPath -> Analysis. No server/UI deps. Unit-tested.
server/     Fastify. Runs analyzer, caches, serves API, proxies Claude.
web/        React + Vite (current scaffold moves here). Monaco-based UI.
shared/     TS types (Analysis, FileNode, Edge, Signal, ...) imported by all.
```

**Flow:** `POST /analyze {path}` → analyzer builds `Analysis` → held in memory +
cached to disk (`.cache/<hash>.json`, key = repo path + file mtimes) → frontend
pulls per-file slices → Claude endpoints layer prose on top of static signals on
demand.

## Data model (`shared/`)

```ts
Analysis {
  repoRoot: string
  entrypoints: string[]          // detected (see below)
  nodes: FileNode[]              // one per source file
  edges: Edge[]                  // import deps, from -> to
}

FileNode {
  id: string                     // repo-relative path
  depth: number                  // min graph distance from any entrypoint
  loc: number
  signals: Signal[]              // why interesting
  score: number                  // aggregate interestingness 0..1
}

Edge {
  from: string                   // node id
  to: string                     // node id
  dynamic: boolean               // dynamic/async import
}

Signal {
  kind: 'high-fan-in' | 'complex-state' | 'unclear-name'
      | 'boundary-crossing' | 'heavily-tested' | 'dynamic-import'
  line?: number                  // anchors annotation to an editor line
  detail: string                 // short static description
  severity: number
}
```

v1 graph granularity is **file-level nodes**. Signals carry an optional `line`
for in-file annotation anchoring; ts-morph is used for line-level detection even
though graph nodes stay file-level. (Symbol-level graph nodes are deferred.)

## Analyzer

- **Module graph:** dependency-cruiser resolves imports via `tsconfig`
  (paths/aliases), emits nodes + edges as JSON, excludes `node_modules`, tags
  dynamic deps, and surfaces fan-in/fan-out, orphans, cycles.
- **Depth (the gauge):** BFS from detected entrypoints along import edges.
  `depth = min hops from any entrypoint`.
- **Entrypoint detection (v1):** `package.json` `main`/`module`/`bin`; common
  `src/main.tsx` / `index.tsx` / `App.tsx`; Vite `index.html` script. Fallback:
  highest-fan-in roots. User override is a later extension.
- **Signals:** dependency-cruiser metrics + ts-morph for line-level detection
  (state hooks, identifiers, dynamic imports, boundary calls).

## Server API

**Fastify.** Holds the current `Analysis` in memory after `/analyze`. Disk cache
keyed by repo path + file-mtime hash makes re-open instant.

Static / analysis endpoints (no LLM):

```
POST /analyze   {path}            -> {repoRoot, entrypoints, stats}  (builds + caches)
GET  /tree                        -> file tree (dirs + nodes w/ score, depth)
GET  /file?path=                  -> {source, language}
GET  /annotations?path=           -> Signal[] for that file (line-anchored)
GET  /graph                       -> nodes + edges (depth gauge / future graph view)
GET  /interesting                 -> ranked feed (top-N by score, w/ signals)
```

Claude endpoints (`@anthropic-ai/sdk`):

```
POST /explain   {path, line|signalId}
   -> prose "what / why" for one annotation.
      Context = code slice + that Signal + node meta.
POST /ask       {path, question}
   -> NL answer, streamed (SSE).
      Context = current file source + graph neighbors (deps + dependents
      source slices) + their signals.
```

- **Context builder** (shared by explain/ask): assembles a bounded, token-budgeted
  prompt — open file + neighbor slices (truncated by score) + relevant signals +
  repo summary. One testable place; keeps prompts consistent.
- **Caching:** `/explain` results cached by `(fileHash, signalId)` to avoid repeat
  API cost (LLM calls stack up fast). `/ask` is freeform, not cached.
- **Key handling:** `ANTHROPIC_API_KEY` from env. Missing key → static features
  still work; LLM endpoints return a graceful "set key" error. The demo degrades,
  never crashes.
- Exact model id and SDK usage will be verified against current Anthropic docs
  before coding (claude-api skill). Default to a capable current Claude model for
  `/ask`; a cheaper model may be used for `/explain`.

## Frontend UI

Three columns; the outer two are collapsible to give the editor + annotations more
room.

```
┌──────────┬─────────────────────────┬──────────────┐
│ SIDEBAR  │   EDITOR (Monaco)       │ ANNOTATIONS  │
│ [tabs]   │   read-only source      │ line-aligned │
│ ·Files   │   gutter marks on       │ cards: signal│
│ ·Depth   │   interesting lines     │ + [Explain]  │
│          │                         │──────────────│
│ collapse │                         │ ASK panel    │
└──────────┴─────────────────────────┴──────────────┘
```

- **Sidebar / Files tab:** file tree; each node shows a small interestingness dot
  (score) + a depth badge.
- **Sidebar / Depth gauge tab:** elevation meter — current file's depth vs
  entrypoint (0), visual shallow→deep scale. Lists shallower (toward entry) and
  deeper (toward leaves) neighbors as clickable steps.
- **Editor:** Monaco, read-only. Interesting lines get a gutter glyph +
  decoration. Clicking a line/glyph scrolls the annotations panel to that
  annotation. Opening a file = `GET /file` + `GET /annotations`.
- **Annotations panel:** one card per `Signal`, anchored to its line (scroll
  synced with editor). Card = signal kind + static `detail` + an **[Explain]**
  button that calls `POST /explain`, streams Claude prose, then caches it.
- **Ask panel:** prompt box; submit calls `POST /ask` (streamed). Shows which
  context was used (e.g. "grounded in: this file + 4 neighbors").
- **State:** light — React Query for server cache + minimal local UI state. No
  heavy global store in v1.
- **Entry UX:** first screen prompts for a local repo path → `POST /analyze` →
  loading → viewer.

## v1 scope (thin vertical slice)

End-to-end but shallow: one local repo → build graph → viewer with file tree +
Monaco + the v1 static-analysis annotations + depth gauge + Claude explanations
on demand + NL ask panel. Everything wired front-to-back; depth over breadth is
deferred.

**In scope:** workspaces skeleton (analyzer/server/web/shared); local-path
analyze; dependency-cruiser + ts-morph pipeline; v1 signal set; depth gauge;
Monaco viewer with annotations; `/explain` + `/ask` via Claude with caching for
explain.

**Out of scope (v1):** remote git URLs; symbol-level graph nodes; whole-repo
retrieval for ask (current file + neighbors only); deferred signals
(`heavily-documented`, `anomaly`); manual entrypoint/context override; interactive
force-directed graph view; auth.

### Form-factor decision

The *ideal* form factor is likely an **IDE extension** (VS Code) — it would live
where engineers already read code and reuse the editor's tree, tabs, and gutter.
We are deliberately **not** building that for v1: extension development adds
unfamiliar complexity (extension host, webview messaging, packaging) that the
short time window does not justify. The **web app** delivers the same core
experience (Monaco gives a near-IDE editor in the browser) with a much simpler
build. An IDE extension is a candidate future direction; the analyzer/server core
is form-factor-agnostic and would carry over.

## Testing

- **analyzer/** — unit tests against small fixture repos: graph correctness,
  depth BFS, each signal rule, boilerplate suppression, external-package
  exclusion, trivial-util gating.
- **server/** — endpoint tests with a fixture analysis; context-builder token
  budgeting; explain cache hit/miss; graceful no-API-key path (mock the SDK).
- **web/** — component tests for tree, depth gauge, annotation sync; mock the API.

## Stack

- React 19 + TypeScript 6, Vite 8 (existing scaffold), oxlint.
- Node v24.18.0 LTS (pinned in `.nvmrc`).
- analyzer: dependency-cruiser + ts-morph.
- server: Fastify.
- editor: Monaco.
- frontend data: React Query.
- LLM: `@anthropic-ai/sdk`.
