#!/bin/sh
# Daily full backup with retention (02 section 5: daily full + WAL archiving, 30 days, monthly restore test).
# Runs inside the `backup` service; PG* env vars provide the connection. Writes /backups/full/<db>-<utc timestamp>.dump
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DIR=/backups/full
WAL_DIR=/backups/wal
mkdir -p "$DIR" "$WAL_DIR"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DIR/${PGDATABASE}-${STAMP}.dump"

echo "[backup] $(date -u +%FT%TZ) starting pg_dump -> $OUT"
pg_dump --format=custom --compress=6 --no-owner --file="$OUT.part" "$PGDATABASE"
mv "$OUT.part" "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
echo "[backup] done, $(du -h "$OUT" | cut -f1)"

# Retention: delete dumps and archived WAL older than the window.
find "$DIR" -type f -name '*.dump*' -mtime +"$RETENTION_DAYS" -delete
find "$WAL_DIR" -type f -mtime +"$RETENTION_DAYS" -delete
echo "[backup] retention applied (${RETENTION_DAYS} days)"

# Restore test (run monthly by an operator, see infra/README.md):
#   createdb restore_test && pg_restore --no-owner --dbname=restore_test <dump>
#   psql restore_test -c 'select count(*) from employees' && dropdb restore_test
