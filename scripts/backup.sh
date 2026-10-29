#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  for f in "$ROOT/server/.env" "$ROOT/.env"; do
    [[ -f "$f" ]] || continue
    line="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$f" | head -n1 || true)"
    if [[ -n "$line" ]]; then
      DB_URL="${line#*=}"; DB_URL="${DB_URL#\"}"; DB_URL="${DB_URL%\"}"; DB_URL="${DB_URL#\'}"; DB_URL="${DB_URL%\'}"
      break
    fi
  done
fi
[[ -n "$DB_URL" ]] || { echo "DATABASE_URL missing (set server/.env)"; exit 1; }

# parse URL
read -r DB_USER DB_PASS DB_HOST DB_PORT DB_NAME <<EOF
$(node -e 'const u=new URL(process.argv[1]); console.log(encodeURIComponent(u.username), encodeURIComponent(u.password), u.hostname, u.port||5432, (u.pathname.replace(/^\//,"").split("?")[0]))' "$DB_URL")
EOF
DB_USER="$(node -e 'console.log(decodeURIComponent(process.argv[1]))' "$DB_USER")"
DB_PASS="$(node -e 'console.log(decodeURIComponent(process.argv[1]))' "$DB_PASS")"
export PGPASSWORD="$DB_PASS"

KEEP="${KEEP:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TAG="${TAG:-}"; SUFFIX=""; [[ -n "$TAG" ]] && SUFFIX="-$TAG"
DUMP="$BACKUP_DIR/helpdesk-$STAMP$SUFFIX.dump"
UPLOADS_ARCHIVE="$BACKUP_DIR/uploads-$STAMP$SUFFIX.tar.gz"

echo "Dumping '$DB_NAME' -> $DUMP"
pg_dump -Fc -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$DUMP"
pg_restore --list "$DUMP" >/dev/null

UPLOADS_DIR="$ROOT/server/uploads"
if [[ -d "$UPLOADS_DIR" ]]; then
  echo "Archiving uploads -> $UPLOADS_ARCHIVE"
  tar -czf "$UPLOADS_ARCHIVE" -C "$UPLOADS_DIR" .
else
  echo "No server/uploads folder; skipping file archive."
fi

mapfile -t OLDS < <(ls -1 "$BACKUP_DIR"/helpdesk-*.dump 2>/dev/null | sort -r | tail -n +$((KEEP+1)) || true)
for old in "${OLDS[@]:-}"; do
  [[ -f "$old" ]] || continue
  base="$(basename "$old")"; stamp_in_name="${base#helpdesk-}"; stamp_in_name="${stamp_in_name%.dump}"
  rm -f "$BACKUP_DIR"/uploads-"$stamp_in_name"*.tar.gz "$old"
  echo "Pruned old backup: $base"
done

COUNT="$(ls -1 "$BACKUP_DIR"/helpdesk-*.dump 2>/dev/null | wc -l)"
echo "Backup complete. $COUNT backup pair(s) (keeping $KEEP)."
echo "  Database: $DUMP"
[[ -f "$UPLOADS_ARCHIVE" ]] && echo "  Uploads:  $UPLOADS_ARCHIVE"
