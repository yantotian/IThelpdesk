# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app

# Only manifests first, so the dependency layer is cached independently of source.
COPY package.json package-lock.json ./
# The frontend depends on braces via `file:./vendor/braces`, so the local vendor
# directory must be present before `npm ci` runs; otherwise install/build fails
# with ENOENT on the missing vendor path.
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

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/tsconfig.json ./
COPY server/src ./src
# copy-assets.ts (part of `npm run build`) reads from server/scripts/ at build
# time, so that directory must be present in the image or the build fails.
COPY server/scripts ./scripts
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runtime: nginx serves the SPA and proxies the API
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk upgrade --no-cache && apk add --no-cache nginx curl
# The Compose stack drops all Linux capabilities (`cap_drop: [ALL]`), so even
# UID 0 cannot bypass permission checks. Keep these nginx directories owned by
# `root` (matching the Dockerfile's `user root;` directive below) so the master
# process can create log/pid/temp files despite those dropped capabilities.
RUN mkdir -p /var/log/nginx /var/lib/nginx /run/nginx \
 && mkdir -p /var/lib/nginx/tmp/client_body /var/lib/nginx/tmp/proxy_temp \
             /var/lib/nginx/tmp/fastcgi_temp /var/lib/nginx/tmp/uwsgi_temp \
             /var/lib/nginx/tmp/scgi_temp \
 && chown -R root:root /var/log/nginx /var/lib/nginx /run/nginx \
 && chmod -R 755 /var/log/nginx /var/lib/nginx /run/nginx
# The master process is still started as root, but config reloads/worker startup
# in this base image can otherwise run as the `nginx` account and trip over the
# shared directories. Run nginx as root inside the container.
RUN sed -i 's/^user [^;]*;/user root;/' /etc/nginx/nginx.conf

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
# Drop dev-only tooling (tsc, tsx, @types/*) from the production image so the
# runtime container only ships what the API needs at execution time. This must
# run before npm itself is removed below.
RUN npm prune --omit=dev --prefix /app/api
# The runtime only executes Node; remove package-manager tooling and its CVE surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production \
    PORT=5577 \
    UPLOAD_DIR=/app/uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://localhost/api/health || exit 1

# entrypoint.sh starts the API and nginx itself and supervises both, so there
# is no default command to pass through.
ENTRYPOINT ["/app/entrypoint.sh"]

