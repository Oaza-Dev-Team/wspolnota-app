#!/bin/sh
# Kartoteka DK — encrypted database backup.
#
#   BACKUP_PASSPHRASE=… ./scripts/backup.sh /var/backups/kartoteka
#
# Run from cron on the host, next to the retention job:
#   15 3 * * *  cd /srv/kartoteka && ./scripts/backup.sh /var/backups/kartoteka
#
# The dump is encrypted before it touches the disk, so a stolen backup volume
# is not a copy of the registry. The registry holds article 9 data; an
# unencrypted dump sitting in /var/backups would undo everything else.
set -eu

DEST="${1:-/var/backups/kartoteka}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE is not set — refusing to write an unencrypted dump." >&2
  exit 1
fi

# The compose file reads POSTGRES_* from .env; so does this script.
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi

mkdir -p "$DEST"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
TARGET="$DEST/kartoteka-$STAMP.sql.gz.gpg"

# Straight from pg_dump into gzip into gpg: the plaintext never becomes a file.
docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase "$BACKUP_PASSPHRASE" --output "$TARGET"

# A zero-byte file means one of the pipeline stages failed quietly.
if [ ! -s "$TARGET" ]; then
  echo "Backup produced an empty file: $TARGET" >&2
  rm -f "$TARGET"
  exit 1
fi

echo "Backup written: $TARGET ($(du -h "$TARGET" | cut -f1))"

# Retention: thirty days, per the GDPR section of the design document.
find "$DEST" -name 'kartoteka-*.sql.gz.gpg' -type f -mtime "+$KEEP_DAYS" -print -delete
