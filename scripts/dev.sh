#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[[ -f server/.env ]] || { echo "Missing server/.env"; exit 1; }

cleanup() { jobs -p | xargs -r kill 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "Starting API on :5577"
npm --prefix server run dev &
API_PID=$!
echo "Starting Vite on :5173"
npm run dev &
WEB_PID=$!

echo "App: http://localhost:5173  API: http://localhost:5577  Health: http://localhost:5577/api/health"
echo "Press Ctrl+C to stop both."
wait "$API_PID" "$WEB_PID"
