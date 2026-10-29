#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="new-main"
PROD=false
DEV=false
SKIP_SCHEMA=false
SERVICE_NAME="${SERVICE_NAME:-ciodes}"

usage() { echo "Usage: $0 [--prod|--dev] [--skip-schema-gate] [--branch NAME] [--service NAME]"; exit 2; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod) PROD=true; shift;;
    --dev) DEV=true; shift;;
    --skip-schema-gate) SKIP_SCHEMA=true; shift;;
    --branch) BRANCH="${2:?}"; shift 2;;
    --service) SERVICE_NAME="${2:?}"; shift 2;;
    -h|--help) usage;;
    *) echo "Unknown arg: $1"; usage;;
  esac
done

fail() { echo; echo "UPDATE STOPPED: $*" >&2; exit 1; }
log()  { echo -e "\033[0;36m$*\033[0m"; }
ok()   { echo -e "\033[0;32m$*\033[0m"; }
warn() { echo -e "\033[0;33m$*\033[0m"; }

# 1. clean tree
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  fail "Uncommitted changes. Commit or stash before updating."
fi
HEAD_BEFORE="$(git rev-parse --short HEAD)"

# 2. fetch
log "Fetching origin/$BRANCH ..."
git fetch origin "$BRANCH"
INCOMING="$(git rev-list --count "HEAD..origin/$BRANCH")"
if [[ "$INCOMING" == "0" ]]; then
  ok "Already up to date with origin/$BRANCH."
else
  log "Incoming commits: $INCOMING"
  git log --oneline "HEAD..origin/$BRANCH"
  echo "---"; git diff --stat "HEAD..origin/$BRANCH"
fi

# 3. schema gate
DESTRUCTIVE_RE='DROP[[:space:]]+TABLE|TRUNCATE|DELETE[[:space:]]+FROM|DROP[[:space:]]+COLUMN|DROP[[:space:]]+SCHEMA|DROP[[:space:]]+DATABASE'
BAD="$(git diff "HEAD..origin/$BRANCH" -- server/src/db/schema.sql | grep -E '^\+' | grep -v '^\+\+\+' | grep -Ei "$DESTRUCTIVE_RE" || true)"
if [[ -n "$BAD" && "$SKIP_SCHEMA" != "true" ]]; then
  echo; echo "SCHEMA GATE: destructive statements in incoming schema.sql:" >&2
  printf '%s\n' "$BAD" >&2
  fail "Review the diff: git diff HEAD..origin/$BRANCH -- server/src/db/schema.sql. Re-run with --skip-schema-gate if accepted."
elif [[ -n "$BAD" ]]; then
  warn "Schema gate overridden: $(printf '%s\n' "$BAD" | wc -l) destructive line(s) accepted."
fi

# 4. backup
log "=== Backing up before update ==="
KEEP="${KEEP:-7}" bash scripts/backup.sh
LATEST_DUMP="$(ls -1 "$ROOT"/backups/helpdesk-*.dump 2>/dev/null | sort -r | head -n1)"

# 5. stop running stack
log "Stopping running stack..."
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  systemctl stop "$SERVICE_NAME"
fi
MY_PID=$$
for pid in $(pgrep -f "$ROOT" 2>/dev/null || true); do
  [[ "$pid" == "$MY_PID" ]] && continue
  cmd="$(ps -o args= -p "$pid" 2>/dev/null || true)"
  if printf '%s' "$cmd" | grep -Eqi 'node|npm|tsx|vite|esbuild'; then
    kill -TERM "$pid" 2>/dev/null || true
  fi
done
for port in 5577 5173; do
  for pid in $(ss -ltnp "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true); do
    kill -TERM "$pid" 2>/dev/null || true
  done
done
FREE=false
for i in $(seq 1 20); do
  BUSY="$(ss -ltn 'sport = :5577 or sport = :5173' 2>/dev/null | grep -c LISTEN || true)"
  if [[ "$BUSY" == "0" ]]; then FREE=true; break; fi
  sleep 1
done
[[ "$FREE" == "true" ]] || fail "Ports 5577/5173 still in use."

# 6. pull
log "=== Pulling ==="
git pull --ff-only origin "$BRANCH"

# 7. deps + build
log "=== Installing dependencies ==="
npm ci --no-audit --no-fund
npm ci --no-audit --no-fund --prefix server
log "=== Building ==="
npm run build
npm run server:build

# 8. start
log "=== Starting ==="
mkdir -p "$ROOT/logs" "$ROOT/run"
if [[ "$PROD" == "true" ]] || [[ "$DEV" != "true" ]]; then
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
    systemctl start "$SERVICE_NAME"
  else
    nohup env NODE_ENV=production npm run server:start >"$ROOT/logs/app.log" 2>&1 &
    echo $! >"$ROOT/run/app.pid"
  fi
else
  nohup bash scripts/dev.sh >"$ROOT/logs/dev.log" 2>&1 &
  echo $! >"$ROOT/run/dev.pid"
fi

# 9. health
HEALTH_URL="http://localhost:5577/api/health"
HEALTH_OK=false
for i in $(seq 1 40); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then HEALTH_OK=true; break; fi
  sleep 1.5
done
[[ "$HEALTH_OK" == "true" ]] || fail "API did not come up within 60s. Latest backup: $LATEST_DUMP"

ok "API healthy."

# 10. smoke test
log "=== Smoke test ==="
if node scripts/smoke-test.mjs http://localhost:5577; then
  HEAD_AFTER="$(git rev-parse --short HEAD)"
  ok "UPDATE OK: $HEAD_BEFORE -> $HEAD_AFTER | smoke test passed (0 failed)"
  echo "Latest backup: $LATEST_DUMP"
else
  warn "UPDATE FINISHED BUT SMOKE TEST FAILED - data itself wasn't modified by the test."
  warn "Latest backup: $LATEST_DUMP. See README 'Restoring from a backup'."
  exit 1
fi
