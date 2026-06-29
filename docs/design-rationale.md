# Vantage — Design Rationale

> Draft scaffold. Sections marked _TODO_ are for the author to write; the two
> populated sections below are generated bullet stubs to expand/trim.

## Problem & goals

_TODO_ — orient new engineers in an unfamiliar TS/React repo; surface
"interesting" code; orient relative to a reference point. Navigation, not
bug-finding. Scope locked to TypeScript/React.

## The orienteering metaphor

_TODO_ — summit = entrypoint, depth = descent into the valley, trail markers =
interesting code, trails = recommended routes, difficulty ratings.

## What "interesting" means

_TODO_ — the five signals and why each was chosen; the gates that exclude
boilerplate; relative scoring.

## Architecture

_TODO_ — analyzer (dependency-cruiser graph + ts-morph syntactic signals) /
Fastify server (in-memory analysis, LLM proxy) / React+Vite+Monaco web. Data
contract in `shared/`.

## Design decisions & trade-offs

- **Syntactic-only analysis (ts-morph, no type-checker program).** Chose
  interactivity over precision — skips the expensive TS program build, so a
  ~1900-file repo (jitsi) analyzes in ~4s. Cost: no type resolution, so signal
  detection is structural/heuristic, not type-aware.
- **dependency-cruiser for the import graph** instead of hand-rolling
  resolution. Gets tsconfig-paths + dynamic-import handling for free; pays a
  heavy dependency + adapting its output. A first-party filter drops
  node_modules, `../` escapes, `.d.ts`, and test files.
- **Depth = multi-source BFS from detected entrypoint(s)**, dynamic edges
  traversed, unreachable = `null` (off-trail). Directly serves "orient relative
  to a reference point." Trade-off: depth is *import distance*, not runtime/call
  distance — an approximation.
- **"Interesting" = 5 curated, gated signals** (high-fan-in, complex-state,
  boundary-crossing, dynamic-import, recency) rather than one opaque score. Gates
  encode the edge cases: simple utils are excluded (high-fan-in needs
  `loc ≥ 30 && branches ≥ 3`), external packages don't count. Trade-off:
  heuristics miss interesting-but-unmatched code and risk false positives (e.g.
  `fetch` detection).
- **Percentile-rank scoring over signal-bearing files only** (zero-signal = 0).
  Stops boilerplate zeros from inflating ranks. Trade-off: scores are *relative
  within a repo*, not absolute or comparable across repos.
- **Recency self-skips on uniform mtimes** (fresh clones/snapshots). Honest —
  refuses to emit a garbage signal. Cost: it's invisible on the deployed
  playground snapshot.
- **LLM context: explain vs ask asymmetry.** `explain` sends a window centered on
  the marker (±6 lines, numbered) → precise. `ask` head-truncates the file at
  6000 chars → cheap but breaks on large files (see Limitations). Adaptive
  thinking; opus by default, sonnet for cost; explain results cached.
- **Orienteering metaphor as the product surface** (summit / elevation / markers
  / trails / difficulty). Makes an abstract graph legible to a newcomer. Risk:
  metaphor over substance — mitigated by keeping each mapping literal.
- **Playground security posture.** `PLAYGROUND=1` disables `/analyze` + `/pick`
  (can't repoint at the host FS), path-containment guards `/file`, the Claude key
  is a host secret living outside `REPO_PATH`, single-origin Caddy (no CORS).
  Trade-off: a shared process-global key (fine for a few reviewers) vs.
  refactoring locked code for per-session keys.
- **Visibility-first build** (mock data → live swap) on an npm-workspaces
  monorepo. Got the UI in front early; cost some mock→live rework.
- **Scope locked to TS/React** (per brief) → entrypoint heuristics tuned to
  Vite/React conventions (`index.html` script tag, `src/main.tsx`).

## Limitations

- **`ask` truncates large files.** `ask()` slices source to the first 6000 chars
  (`server/src/llm.ts`), so a question about code deeper in a big file gets a poor
  answer — e.g. a `useEffect` past char 6000 in `excalidraw-app/App.tsx` (≈39.7 KB)
  is invisible to the model. `explain` is unaffected (it windows around the marker
  line). Fix = center `ask`'s window on the referenced symbol / raise the cap.
- _TODO_ — add others as needed (recency on snapshots, false positives, no tests).

## How we'd extend with more time

- **Semantic feature clustering** — group files into features (import topology +
  names/embeddings), not just per-file signals.
- **Hot-path detection** — flag critical/perf-sensitive paths; optionally fold in
  coverage/runtime traces to find actually-executed code.
- **Type-aware tier (opt-in)** — a real call graph + type-based fan-in for
  precision when speed isn't the constraint.
- **Fix `ask` retrieval** — center the window on the referenced symbol;
  multi-file RAG over the repo instead of head-truncation.
- **Git-blame integration** — "ask the original author"; churn as an additional
  signal.
- **Complexity heat map** on the file tree + elevation gauge.
- **Per-session keys + rate limiting** for a true multi-tenant public playground.
- **Remote git-URL ingestion** (clone + analyze) instead of a local path.
- **VS Code extension** — orientation in-editor.
- **Broader entrypoint detection** — Next.js/Remix routing and more frameworks.
- **Persisted/cached analysis** (currently in-memory) for very large repos.
- **Automated tests** — deliberately skipped for the demo.
