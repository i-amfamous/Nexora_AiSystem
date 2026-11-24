#!/usr/bin/env bash
# Nexora recoverable backup helper (SRS NFR-10).
# Backs up the local file store and, when DATABASE_URL is set, a PostgreSQL dump.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-.data/backups}"
DATA_FILE="${DATA_FILE:-.data/nexora.json}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/$STAMP"

mkdir -p "$TARGET"
echo "[Nexora] Creating backup in $TARGET"

if [ -f "$DATA_FILE" ]; then
  cp "$DATA_FILE" "$TARGET/nexora.json"
  echo "[Nexora] File store copied: $DATA_FILE"
else
  echo "[Nexora] File store not found at $DATA_FILE; skipped."
fi

if [ -n "${DATABASE_URL:-}" ]; then
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "$DATABASE_URL" --no-owner --no-privileges --format=custom --file="$TARGET/database.dump"
    echo "[Nexora] PostgreSQL dump created."
  else
    echo "[Nexora] DATABASE_URL is set but pg_dump was not found; database dump skipped." >&2
  fi
fi

cat > "$TARGET/manifest.json" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "dataFile": "$DATA_FILE",
  "database": $(if [ -f "$TARGET/database.dump" ]; then echo 'true'; else echo 'false'; fi),
  "version": "2.0.0"
}
EOF

echo "[Nexora] Backup complete: $TARGET"
