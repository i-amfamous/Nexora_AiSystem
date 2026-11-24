#!/usr/bin/env bash
# Restore a Nexora backup created by scripts/backup.sh.
# This is destructive: pass --confirm after checking the target directory.
set -euo pipefail

if [ "${1:-}" = "" ] || [ "${1:-}" = "--confirm" ]; then
  echo "Usage: bash scripts/restore.sh <backup-directory> --confirm" >&2
  exit 1
fi
BACKUP="$1"
if [ "${2:-}" != "--confirm" ]; then
  echo "Refusing to restore without --confirm. Example: bash scripts/restore.sh .data/backups/20261124T000000Z --confirm" >&2
  exit 1
fi
if [ ! -d "$BACKUP" ]; then
  echo "Backup directory not found: $BACKUP" >&2
  exit 1
fi

DATA_FILE="${DATA_FILE:-.data/nexora.json}"
if [ -f "$BACKUP/nexora.json" ]; then
  mkdir -p "$(dirname "$DATA_FILE")"
  cp "$DATA_FILE" "$DATA_FILE.pre-restore.$(date -u +%Y%m%dT%H%M%SZ)" 2>/dev/null || true
  cp "$BACKUP/nexora.json" "$DATA_FILE"
  echo "[Nexora] File store restored to $DATA_FILE"
fi

if [ -f "$BACKUP/database.dump" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[Nexora] This backup contains a database dump but DATABASE_URL is not set." >&2
    exit 1
  fi
  if ! command -v pg_restore >/dev/null 2>&1; then
    echo "[Nexora] pg_restore was not found." >&2
    exit 1
  fi
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$BACKUP/database.dump"
  echo "[Nexora] PostgreSQL dump restored."
fi

echo "[Nexora] Restore complete from $BACKUP"
