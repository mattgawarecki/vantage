# Vantage — Code Orientation Tool — Design

**Date:** 2026-06-27
**Status:** Approved (design), rev 2 — incorporates staff + mid-level review;
pending implementation plan

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
| `high-fan-in` | many **repo-internal** dependents **AND** clears a min-complexity bar (see edge cases). `import type` edges excluded from fan-in |
| `complex-state` | density of `useState` / `useReducer` / `useContext` / `useEffect`; flag dense clusters |
| `boundary-crossing` | implicit client↔server crossings — `fetch` / `axios` / `'use server'` / route handlers |
| `recency` | recently-modified file (mtime now; git-churn a later upgrade) — "where the team is working now," the signal a newcomer cares most about |
| `dynamic-import` | `import()`, `await import()`, `React.lazy(() => import())` — flagged via dependency-cruiser `dynamic:true` + ts-morph line anchor. **Punt-able** if too complex/expensive; if dropped, see the depth-BFS note in Analyzer |

Revised after review: `unclear-name` cut (idiomatic `data`/`e`/`i`/`tmp` →
false-positive machine; would spam the noise we promise to suppress) and
`heavily-tested` cut (low newcomer value; well-tested code is often the *safe*
code they need least). Both moved to deferred. `recency` added in their place.

Deferred signals (post-v1): `unclear-name` (hard-scoped to exported public-API
identifiers only, if revived), `heavily-tested`, `heavily-documented`
(comment-line ratio), `anomaly` (breaks local convention, e.g. lone default-export
among named, deep relative `../../..` imports), symbol-level granularity.

### Scoring

Each file gets `score` (0..1) = weighted sum of signals **minus** boilerplate
anti-signals. `score` ranks the "interesting feed"; per-file `signals[]` drive
the line-anchored annotations.

- **Normalization:** map raw weighted sums through a **percentile rank** (or
  sigmoid), **not** raw min-max — a single outlier file otherwise dominates the
  scale and tiny/degenerate repos produce meaningless scores.
- **Seed weights** (starting point, tune by spot-check): `high-fan-in` 1.0,
  `complex-state` 0.8, `boundary-crossing` 0.8, `dynamic-import` 0.5,
  `recency` 0.6; boilerplate anti-signal −0.5. These are a starting guess, not
  load-bearing — adjust against a demo repo.
- **Degenerate repos:** if too few files clear the bar, the feed shows whatever
  ranks highest with a "small repo — limited signal" note rather than an empty
  panel.
- **Quality check (v1):** manual spot-check on a chosen demo repo — eyeball the
  top-N feed, tune weights by judgment. (A labeled fixture + precision@10 is the
  principled upgrade; deferred to keep the time box.)

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
  depth: number | null           // min graph distance from any entrypoint;
                                 // null = unreachable (orphan / disconnected)
  loc: number
  mtimeMs: number                // for recency signal + cache key
  signals: Signal[]              // why interesting
  score: number                  // aggregate interestingness 0..1
}

Edge {
  from: string                   // node id
  to: string                     // node id
  dynamic: boolean               // dynamic/async import (still traversed by depth BFS)
  typeOnly: boolean              // `import type` — excluded from fan-in scoring
}

Signal {
  kind: 'high-fan-in' | 'complex-state' | 'boundary-crossing'
      | 'recency' | 'dynamic-import'
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
  dynamic + type-only deps, and surfaces fan-in/fan-out, orphans, cycles.
  **v1 assumes a single-`tsconfig` repo** — project-references / multi-tsconfig
  monorepos mis-resolve aliases and spuriously orphan files; pick the demo repo
  accordingly.
- **Depth (the gauge):** BFS from detected entrypoints along import edges.
  `depth = min hops from any entrypoint`.
  - **Unreachable nodes** (tests, configs, dead/unimported code) get
    `depth = null` and render as a distinct "off-trail" state — not 0, not blank.
  - **Dynamic edges ARE traversed** by the BFS (cruiser `dynamic:true`); otherwise
    every `React.lazy(() => import())` route subtree disconnects and most feature
    code shows null depth. `dynamic` is kept only for annotation styling. *(If the
    `dynamic-import` signal is punted, still traverse dynamic edges for depth; only
    if dynamic support is dropped entirely do we accept the degeneration.)*
  - **Barrel files** (`index.ts` re-exporting a directory) flatten depth to ~1 for
    everything. v1: at minimum a fixture test proving a barrel-heavy repo still
    yields a sane gauge; a barrel-collapse pass if time allows.
- **Entrypoint detection (v1):** **primary** = Vite `index.html` `<script>` →
  `src/main.tsx` chain (the real React entry). Then `package.json`
  `main`/`module`/`bin` if present. **Fallback** = orphan roots (zero internal
  fan-in, non-trivial fan-out) — NOT highest fan-in (entrypoints have high
  fan-*out* and ~zero fan-*in*; highest-fan-in would pick a deep shared util and
  invert the whole gauge). User override is a later extension.
- **Signals:** dependency-cruiser metrics + ts-morph for line-level detection
  (state hooks, dynamic imports, boundary calls). **ts-morph runs syntactic-only
  (no type-checker program)** — every v1 signal is syntactic, and the full
  type-resolution program is the main perf/memory bottleneck (tens of seconds on a
  medium repo). Parse files individually.
- **Resilience:** a single unparseable file (decorators, newer TS, JSX edge cases)
  must not crash `/analyze` — skip-and-report (collect into a `warnings[]`), keep
  going.

## Server API

**Fastify.** Holds the current `Analysis` in memory after `/analyze`. Disk cache
keyed by repo path + file-mtime hash makes re-open instant. *Caveat:* `git
checkout`/clone don't reliably bump mtimes, so the cache can serve stale analysis
after a branch switch — acceptable for a demo; content-hashing the file-list
digest is the principled fix (noted, deferred).

Static / analysis endpoints (no LLM):

```
POST /analyze   {path}            -> {repoRoot, entrypoints, summary}  (builds + caches)
                                     summary = {fileCount, topDirs, framework,
                                                entrypoints, orphanCount, cycleCount,
                                                warnings}  (powers the summary card)
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
  repo summary. One testable place; keeps prompts consistent. **Cap dependent
  count explicitly** (e.g. top 5 by score), not just by token budget — a
  popular file can have dozens of dependents and blow the window.
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
┌──────────────┬─────────────────────────┬──────────────┐
│ SIDEBAR      │   EDITOR (Monaco)       │ ANNOTATIONS  │
│ [tabs]       │   read-only source      │ line-aligned │
│ ·Files       │   gutter marks on       │ cards: signal│
│ ·Elevation   │   interesting lines     │ + [Explain]  │
│ ·Trail mkrs  │                         │──────────────│
│              │                         │ ASK panel    │
│ collapse     │                         │              │
└──────────────┴─────────────────────────┴──────────────┘
```

- **Sidebar / Files tab:** file tree; each node shows a small interestingness dot
  (score) + a depth badge. Unreachable nodes (`depth = null`) get an "off-trail"
  marker, not a number.
- **Sidebar / Elevation tab (depth gauge):** elevation meter — current file's
  depth vs entrypoint (0), visual shallow→deep ramp **with a one-line legend**
  ("0 = entrypoint; higher = deeper toward leaves") and a color ramp committed to
  the metaphor. Lists shallower (toward entry) and deeper (toward leaves) neighbors
  as clickable steps. When several entrypoints exist, the gauge anchors on the one
  the current file is closest to (and names it).
- **Sidebar / Trail markers tab (the interesting feed):** ranked `/interesting`
  list — pillar #1's home in the layout. Each row = file + top signal + score;
  click jumps to the file. (Without this the headline feature had no UI slot.)
- **Repo summary card:** shown on load (and reachable after) — file count, top
  directories, detected framework, entrypoints, **orphan + cycle counts**, and any
  parse warnings. The "terrain overview" before drilling in; data already comes
  from `/analyze` summary.
- **Editor:** Monaco, read-only. Interesting lines get a gutter glyph +
  decoration. Clicking a glyph/line scrolls the annotations panel to that
  annotation (**one-directional sync in v1** — glyph→panel; full bidirectional
  scroll-sync is finicky and deferred). Opening a file = `GET /file` +
  `GET /annotations`.
- **Annotations panel:** one card per `Signal`, anchored to its line. Card =
  signal kind + static `detail` + an **[Explain]** button that calls
  `POST /explain`, streams Claude prose, then caches it.
- **Ask panel:** prompt box; submit calls `POST /ask` (streamed). Shows which
  context was used (e.g. "grounded in: this file + 4 neighbors").
- **State:** light — React Query for server cache + minimal local UI state. No
  heavy global store in v1.
- **Entry UX:** first screen prompts for a local repo path → `POST /analyze` →
  loading → **summary card + viewer with the primary entrypoint auto-opened**
  ("this is where the app starts"), so the user never lands in an empty editor.

## v1 scope (thin vertical slice)

End-to-end but shallow: one local repo → build graph → viewer with file tree +
Monaco + the v1 static-analysis annotations + depth gauge + Claude explanations
on demand + NL ask panel. Everything wired front-to-back; depth over breadth is
deferred.

**In scope:** workspaces skeleton (analyzer/server/web/shared); local-path
analyze (single-tsconfig repo); dependency-cruiser + ts-morph (syntactic-only)
pipeline; v1 signal set (`high-fan-in`, `complex-state`, `boundary-crossing`,
`recency`, `dynamic-import`); depth gauge with null/off-trail handling +
dynamic-edge traversal + legend; Trail-markers feed tab; repo summary card;
auto-open entrypoint; Monaco viewer with annotations (one-directional sync);
`/explain` + `/ask` via Claude with caching for explain.

**Minimal newcomer wins pulled into v1** (the rest deferred): auto-open primary
entrypoint, repo summary card (orphans/cycles/counts), and a home for the
interesting feed (Trail-markers tab).

**Out of scope (v1):** remote git URLs; symbol-level graph nodes; whole-repo
retrieval for ask (current file + neighbors only); cut/deferred signals
(`unclear-name`, `heavily-tested`, `heavily-documented`, `anomaly`); barrel-collapse
pass (fixture-tested only); labeled eval fixture (manual spot-check instead);
bidirectional scroll-sync; multi-tsconfig repos; git-churn recency (mtime only);
trailhead README/docs surfacing, scripts panel, ask starter questions, directory
region map, guided tour, breadcrumb (all future); manual entrypoint/context
override; interactive force-directed graph view; auth.

### Future directions

- **Ask the author (git blame).** For a given file/line, use `git blame` to
  identify the original author and recent contributors, then surface a "who to
  ask" affordance — point a stuck newcomer at the person with the most context,
  not just an LLM guess. Fits the orienteering brand (a ranger who knows the
  trail). Requires the repo to be a git checkout; pairs naturally with the
  annotations panel and the recency signal.
- **Complexity heat map.** Color-code the file tree and elevation meter by
  interestingness/complexity `score`, so the map reads as a heat map — hot zones
  draw the eye to the gnarly terrain at a glance. Strong metaphor fit (elevation +
  heat) and reuses `score` we already compute.
- **IDE extension** form factor (see below).
- **Remote git URL** ingestion.

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
  exclusion, trivial-util gating, `import type` excluded from fan-in. **Plus the
  degeneration fixtures the reviews flagged:** unreachable nodes → `depth = null`;
  dynamic-edge traversal (a `React.lazy` route subtree stays reachable);
  barrel-heavy repo still yields a sane gauge; entrypoint fallback picks orphan
  roots not high-fan-in; an unparseable file is skipped + reported, not fatal;
  degenerate/tiny repo produces sane scores (normalization).
- **server/** — endpoint tests with a fixture analysis; context-builder token
  budgeting + dependent-count cap; explain cache hit/miss; graceful no-API-key
  path (mock the SDK); `/analyze` summary shape.
- **web/** — component tests for tree (incl. off-trail nodes), elevation gauge +
  legend, trail-markers feed, annotation glyph→panel sync; mock the API.

## Stack

- React 19 + TypeScript 6, Vite 8 (existing scaffold), oxlint.
- Node v24.18.0 LTS (pinned in `.nvmrc`).
- analyzer: dependency-cruiser + ts-morph.
- server: Fastify.
- editor: Monaco.
- frontend data: React Query.
- LLM: `@anthropic-ai/sdk`.
