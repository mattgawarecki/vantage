#!/usr/bin/env bash
set -euo pipefail

# Two processes, one container:
#   - Fastify API pinned to loopback 127.0.0.1:8787 (never exposed directly)
#   - Caddy on the host-provided $PORT, serving the SPA + proxying the API
#
# Render/Railway inject $PORT for the *public* listener. We must keep that off
# Fastify, so the API port is forced to 8787 just for that process.

( cd /app/server && PORT=8787 exec /app/node_modules/.bin/tsx src/index.ts ) &
api_pid=$!

# If the API dies, take the container down so the platform restarts it.
trap 'kill -TERM "$api_pid" 2>/dev/null || true' EXIT

exec caddy run --config /app/deploy/Caddyfile --adapter caddyfile
