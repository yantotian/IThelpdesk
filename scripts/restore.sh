#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
UPLOADS_DIR="$ROOT/server/uploads"

usage() { echo "Usage: $0 [--dump <file>] [--database-url <url>]"; exit 2; }

DUMP=""
DATABASE_URL="${DATABASE_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump) DUMP="${2:?missing value for --dump}"; shift 2 ;;
    --database-url) DATABASE_URL="${2:?missing value for --database-url}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1" >&2; usage ;;
  esac
done

# -- Resolve DATABASE_URL (env var, else server/.env, else root .env) --
if [[ -z "$DATABASE_URL" ]]; then
  for f in "$ROOT/server/.env" "$ROOT/.env"; do
    [[ -f "$f" ]] || continue
    line="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$f" | head -n1 || true)"
    if [[ -n "$line" ]]; then
      DATABASE_URL="${line#*=}"
      DATABASE_URL="${DATABASE_URL#\"}"
      DATABASE_URL="${DATABASE_URL%\"}"
      DATABASE_URL="${DATABASE_URL#\'}"
      DATABASE_URL="${DATABASE_URL%\'}"
      break
    fi
  done
fi
[[ -n "$DATABASE_URL" ]] || { echo "ERROR: DATABASE_URL not found (set it or pass --database-url)." >&2; exit 1; }

# -- Parse the connection string for pg_dump/pg_restore --
read -r DB_USER DB_PASS DB_HOST DB_PORT DB_NAME <<EOF
$(node -e 'const u=new URL(process.argv[1]); console.log(encodeURIComponent(u.username), encodeURIComponent(u.password), u.hostname, u.port||5432, (u.pathname.replace(/^\//,"").split("?")[0]))' "$DATABASE_URL")
EOF
DB_USER="$(node -e 'console.log(decodeURIComponent(process.argv[1]))' "$DB_USER")"
DB_PASS="$(node -e 'console.log(decodeURIComponent(process.argv[1]))' "$DB_PASS")"
export PGPASSWORD="$DB_PASS"

# -- Stop the stack so nothing reads the database mid-restore --
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "${SERVICE_NAME:-ciodesk}" 2>/dev/null; then
  systemctl stop "${SERVICE_NAME:-ciodesk}"
fi
MY_PID=$$
for pid in $(pgrep -f "$ROOT" 2>/dev/null || true); do
  if [[ "$pid" == "$MY_PID" ]]; then continue; fi
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
if [[ "$FREE" != "true" ]]; then echo "ERROR: ports 5577/5173 are still in use." >&2; exit 1; fi

# -- Safety-dump the current database before overwriting anything --
STAMP="$(date +%Y%m%d-%H%M%S)"
SAFETY_DUMP="$BACKUP_DIR/helpdesk-$STAMP-prerestore.dump"
echo "Safety-dumping current database -> $SAFETY_DUMP"
if ! pg_dump -Fc -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SAFETY_DUMP"; then
  echo "WARNING: safety dump failed - restoring anyway (the database may be empty or broken)." >&2
fi
if [[ -f "$SAFETY_DUMP" ]]; then
  pg_restore --list "$SAFETY_DUMP" >/dev/null 2>&1 || rm -f "$SAFETY_DUMP"
fi

# -- Pick the dump to restore (newest by default) --
if [[ -z "$DUMP" ]]; then
  DUMP="$(ls -1 "$BACKUP_DIR"/helpdesk-*.dump 2>/dev/null | sort -r | head -n1 || true)"
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERROR: no dump found in $BACKUP_DIR." >&2
  exit 1
fi

# -- Verify the dump is readable before touching anything --
echo "Verifying dump ..."
pg_restore --list "$DUMP" >/dev/null

# -- Restore the database --
echo "Restoring database ..."
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner "$DUMP"

# -- Unpack the matching uploads archive over server/uploads --
UPLOADS_ARCHIVE="$BACKUP_DIR/uploads-$(basename "$DUMP" | sed -e 's/^helpdesk-//' -e 's/\.dump$/.tar.gz/')"
if [[ -f "$UPLOADS_ARCHIVE" ]]; then
  echo "Unpacking uploads -> $UPLOADS_ARCHIVE"
  mkdir -p "$UPLOADS_DIR"
  tar -xzf "$UPLOADS_ARCHIVE" -C "$UPLOADS_DIR"
fi

echo "Restore complete."
echo "  Database: $DUMP"
if [[ -f "$UPLOADS_ARCHIVE" ]]; then
  echo "  Uploads:  $UPLOADS_ARCHIVE"
fi
echo "Next steps:"
echo "  bash scripts/dev.sh          # start the app (or: npm run server:start)"
echo "  node scripts/smoke-test.mjs http://localhost:5577 # verify (must be 0 failed)"
echo "  Existing sessions are invalidated - sign in again."
