#!/bin/sh
set -e

# Wait for PostgreSQL to accept connections before running migrations.
if [ -n "$DATABASE_WAIT_HOST" ]; then
  echo "[entrypoint] waiting for postgres at $DATABASE_WAIT_HOST..."
  i=0
  until node -e "
    const net = require('net');
    const s = net.connect($DATABASE_WAIT_PORT, '$DATABASE_WAIT_HOST', () => { s.end(); process.exit(0); });
    s.on('error', () => process.exit(1));
  "; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      echo "[entrypoint] postgres did not become ready in time"
      exit 1
    fi
    sleep 2
  done
fi

# Apply schema and seed admin (already done in entrypoint, but run again for completeness)
echo "[entrypoint] applying schema..."
node /app/api/dist/db/init.js

# Substitute the API port into nginx proxy config
sed -i "s|proxy_pass http://127.0.0.1:3001|proxy_pass http://127.0.0.1:${APP_PORT:-3001}|g" /etc/nginx/http.d/default.conf

echo "[entrypoint] starting API on :${APP_PORT:-3001}"
node /app/api/dist/index.js &
API_PID=$!

# If the API dies, take the whole container down so the orchestrator restarts it.
trap 'kill $API_PID 2>/dev/null || true' EXIT INT TERM

# Wait briefly for the API, then hand off to nginx (PID 1).
for _ in $(seq 1 30); do
  if node -e "
    const http = require('http');
    http.get('http://127.0.0.1:' + (${APP_PORT:-3001}) + '/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1))
        .on('error', () => process.exit(1));
  "; then
    echo "[entrypoint] API healthy"
    break
  fi
  sleep 1
done

echo "[entrypoint] starting nginx"
wait $API_PID &
nginx -g "daemon off;"
