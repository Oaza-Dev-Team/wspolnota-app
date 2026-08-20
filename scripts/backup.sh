#!/bin/bash
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
# pipefail is why this is bash and not sh. Without it the exit status of
# `pg_dump | gzip | gpg` is gpg's alone, so a failed dump still ends in a
# cheerful "Backup written": gzip turns the empty stream into a valid empty
# archive and gpg encrypts it into a plausible-looking kilobyte.
set -euo pipefail

DEST="${1:-/var/backups/kartoteka}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

# The compose file reads POSTGRES_* and the passphrase from .env; so does this
# script. Read it *before* the check below, not after. The other way round, the
# cron entry in docs/DEPLOYMENT.md — which exports nothing, because the whole
# point is to keep the passphrase out of the crontab — refused every night into
# a log file nobody reads. A backup that fails quietly is worse than no backup:
# you believe you have one until the day you need it.
if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ./.env
fi

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE is not set — refusing to write an unencrypted dump." >&2
  exit 1
fi

mkdir -p "$DEST"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
TARGET="$DEST/kartoteka-$STAMP.sql.gz.gpg"

# pipefail aborts the script the moment the dump fails, which is before any of
# the checks below get to run. Without this the failed run leaves its unusable
# kilobyte behind, and the backup directory slowly fills with files that look
# like backups.
trap 'rm -f "$TARGET"' ERR

# Straight from pg_dump into gzip into gpg: the plaintext never becomes a file.
docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase "$BACKUP_PASSPHRASE" --output "$TARGET"

# Size proves nothing: an empty dump still encrypts to a plausible kilobyte.
# Read the file back the way a restore would and look for the header pg_dump
# writes, so "the backup exists" and "the backup is a backup" stop being two
# different claims. This is the only check here that would have caught a dump
# that ran but produced nothing.
# `grep -c` rather than `grep -q`: -q exits on the first match, which closes the
# pipe, which under pipefail turns gpg's SIGPIPE into a failed check and deletes
# a perfectly good backup.
if ! gpg --batch --quiet --decrypt --passphrase "$BACKUP_PASSPHRASE" "$TARGET" 2>/dev/null \
   | gunzip \
   | grep -c 'PostgreSQL database dump' > /dev/null; then
  echo "Backup did not read back as a PostgreSQL dump: $TARGET" >&2
  rm -f "$TARGET"
  exit 1
fi

echo "Backup written: $TARGET ($(du -h "$TARGET" | cut -f1))"

# Retention: thirty days, per the GDPR section of the design document.
find "$DEST" -name 'kartoteka-*.sql.gz.gpg' -type f -mtime "+$KEEP_DAYS" -print -delete
