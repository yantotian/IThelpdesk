#!/bin/sh
set -e

# The API listens on the container-internal PORT (always 3001 by default).
# APP_PORT is only the public port that Compose publishes; never reuse it here.
API_PORT="${PORT:-3001}"

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

# Substitute the API port into the nginx proxy config.
sed -i "s|proxy_pass http://127.0.0.1:3001|proxy_pass http://127.0.0.1:${API_PORT}|g" /etc/nginx/http.d/default.conf

echo "[entrypoint] starting API on :${API_PORT}"
node /app/api/dist/index.js &
API_PID=$!

trap 'kill $API_PID $NGINX_PID 2>/dev/null || true' EXIT INT TERM

# Wait briefly for the API to become healthy.
for _ in $(seq 1 30); do
  if node -e "
    const http = require('http');
    http.get('http://127.0.0.1:' + (${API_PORT}) + '/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1))
        .on('error', () => process.exit(1));
  "; then
    echo "[entrypoint] API healthy"
    break
  fi
  sleep 1
done

echo "[entrypoint] starting nginx"
nginx -g "daemon off;" &
NGINX_PID=$!

# Keep the container alive as long as both processes are running; exit if
# either one dies so the orchestrator restarts the whole container.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 1
done

kill "$API_PID" "$NGINX_PID" 2>/dev/null || true
wait "$API_PID" 2>/dev/null || true
wait "$NGINX_PID" 2>/dev/null || true