# Vantage Playground Deployment

A single container that serves the built web SPA and the Fastify API on **one
origin** (no CORS), locked to a bundled sample repo. Public but `noindex`.

## What's inside

```
Caddy  :$PORT (host)     /            -> web/dist (SPA, client-side fallback)
                         /health …    -> Fastify
                         X-Robots-Tag: noindex, nofollow + robots.txt Disallow: /
Fastify :127.0.0.1:8787  PLAYGROUND=1, REPO_PATH=/app/playground/sample
sample/  vantage-web (our own) + excalidraw-app (MIT) — two summits
```

- **PLAYGROUND=1** disables `/analyze` and `/pick` — the deployment can never be
  repointed at the host filesystem. The UI hides the entry screen and the
  "Change repo" button.
- The Claude key is a **runtime host secret**, never baked into the image and
  living **outside `REPO_PATH`**, so the `/file` endpoint (containment-locked to
  the sample) cannot read it.
- Web is built with `VITE_API_BASE=""` → same-origin relative fetches.

## Environment

| Var | Value | Notes |
|-----|-------|-------|
| `ANTHROPIC_API_KEY` | `sk-…` | **Secret.** Spend-capped key. Set via host secrets, not a file. |
| `PLAYGROUND` | `1` | Set in Dockerfile. Locks the deployment. |
| `REPO_PATH` | `/app/playground/sample` | Set in Dockerfile. The bundled two-repo root. |
| `VANTAGE_EXPLAIN_MODEL` / `VANTAGE_ASK_MODEL` | `claude-sonnet-4-6` | Cheap model to stretch the cap. |
| `PORT` | injected by host | Caddy's public listener. Fastify is pinned to 8787 internally. |

## Deploy — Fly.io

```bash
fly apps create vantage-playground          # or: fly launch --copy-config --no-deploy
fly secrets set ANTHROPIC_API_KEY=sk-...     # spend-capped
fly deploy
```

## Deploy — Render / Railway

Same image. Point the service at `deploy/Dockerfile`, set `ANTHROPIC_API_KEY` as
an env secret. The host injects `PORT`; everything else is baked into the image.

## Local smoke test

```bash
docker build -f deploy/Dockerfile -t vantage-playground .
docker run --rm -p 8080:8080 -e ANTHROPIC_API_KEY=sk-... vantage-playground
# open http://localhost:8080
```

## Cost guard

$5 spend cap on the key + `noindex` + sonnet model. If you want a hard gate, add
Caddy `basic_auth` to the site block in `deploy/Caddyfile`.
