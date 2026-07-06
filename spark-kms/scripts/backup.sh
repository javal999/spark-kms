#!/usr/bin/env bash
# Daily logical backup for SPARK KMS (requirements §9: daily, 30-day retention).
# Usage:  DATABASE_URL=postgres://... BACKUP_DIR=/var/backups/spark ./scripts/backup.sh
# Cron:   15 2 * * *  cd /app && DATABASE_URL=... BACKUP_DIR=... ./scripts/backup.sh >> /var/log/spark-backup.log 2>&1
#
# On Neon/Supabase, prefer their managed PITR and treat this as a secondary.
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/spark_kms-$STAMP.sql.gz"

echo "[backup] dumping to $OUT"
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$OUT"

# Prune backups older than the retention window.
find "$BACKUP_DIR" -name 'spark_kms-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -delete
echo "[backup] done; retained last $RETENTION_DAYS days"
