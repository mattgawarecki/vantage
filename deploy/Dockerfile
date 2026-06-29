# Vantage playground: single container, single origin.
# Build context = repo root.  Build:  docker build -f deploy/Dockerfile .
FROM node:24-slim

# Caddy binary straight from the official image — no apt, no repo setup.
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

WORKDIR /app

# Install deps first for layer caching (only re-runs when a manifest changes).
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY analyzer/package.json analyzer/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# App + vendored sample + deploy config.
COPY . .

# Build the SPA for same-origin API calls (empty base -> relative fetch).
RUN VITE_API_BASE="" npm run build --workspace web

ENV NODE_ENV=production \
    PLAYGROUND=1 \
    REPO_PATH=/app/playground/sample \
    VANTAGE_EXPLAIN_MODEL=claude-sonnet-4-6 \
    VANTAGE_ASK_MODEL=claude-sonnet-4-6
# ANTHROPIC_API_KEY is supplied at runtime as a host secret — never baked in,
# and it lives outside REPO_PATH so /file can never read it.

EXPOSE 8080
CMD ["bash", "/app/deploy/start.sh"]
