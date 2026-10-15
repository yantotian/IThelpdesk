# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app

# Only manifests first, so the dependency layer is cached independently of source.
COPY package.json package-lock.json ./
# `overrides` pins braces to the local vendor/braces directory, which the
# lockfile records as a `link:` entry. It must exist before `npm ci` runs,
# otherwise the install fails with ENOENT on the missing vendor path.
COPY vendor ./vendor
# Cap V8's heap so install/build peaks stay modest. On memory-constrained
# Docker Desktop hosts (small Windows pagefile), an uncapped Node heap lets the
# WSL VM balloon until the host OOM-kills BuildKit mid-build.
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — build the Express API
#
# Based on the `web` stage rather than the bare Node image on purpose: that
# creates a dependency, so BuildKit builds the two Node toolchains sequentially
# instead of in parallel. Running `npm ci` and `tsc` at the same time spikes
# memory and OOMs the BuildKit daemon on memory-constrained Docker Desktop.
# ─────────────────────────────────────────────────────────────────────────────
FROM web AS api
WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runtime: nginx serves the SPA and proxies the API
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk upgrade --no-cache && apk add --no-cache nginx curl

COPY --from=web  /app/dist               /usr/share/nginx/html
COPY --from=api  /app/server/dist        /app/api/dist
COPY --from=api  /app/server/node_modules /app/api/node_modules
COPY --from=api  /app/server/package.json /app/api/package.json
# schema.sql is read at boot to (re)apply the schema idempotently.
COPY --from=api  /app/server/src/db/schema.sql /app/api/src/db/schema.sql

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/entrypoint.sh /app/entrypoint.sh
# Strip CR so the script runs even when checked out with CRLF on Windows.
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh && mkdir -p /app/uploads
# The runtime only executes Node; remove package-manager tooling and its CVE surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/app/uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://localhost/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

