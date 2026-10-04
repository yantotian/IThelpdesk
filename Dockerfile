# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS web
WORKDIR /app

# Only manifests first, so the dependency layer is cached independently of source.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — build the Express API
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS api
WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm install

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runtime: nginx serves the SPA and proxies the API
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache nginx curl

COPY --from=web  /app/dist        /usr/share/nginx/html
COPY --from=api  /app/dist        /app/api/dist
COPY --from=api  /app/node_modules /app/api/node_modules
COPY --from=api  /app/package.json /app/api/package.json
# schema.sql is read at boot to (re)apply the schema idempotently.
COPY --from=api  /app/src/db/schema.sql /app/api/src/db/schema.sql

COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && mkdir -p /app/uploads

ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/app/uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://localhost/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
