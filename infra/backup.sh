#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/wasla}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_DIR="${BACKUP_DIR}/${STAMP}"
mkdir -p "$BACKUP_DIR"
STAGING=$(mktemp -d "$BACKUP_DIR/.pending.XXXXXXXX")
trap 'rm -rf -- "$STAGING"' EXIT

# Consistent online MySQL dump without locking InnoDB tables
docker compose exec -T mysql sh -ec '
  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -u root --single-transaction --routines --triggers "$MYSQL_DATABASE"
' | gzip -c > "${STAGING}/mysql.sql.gz"

# Snapshot product-media bucket from MinIO
docker compose run --rm --no-deps -T --entrypoint sh minio-init -ec '
  mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mkdir -p /tmp/product-media-backup
  mc mirror --quiet local/product-media /tmp/product-media-backup >&2
  tar -czf - -C /tmp product-media-backup
  rm -rf /tmp/product-media-backup
' > "${STAGING}/minio-product-media.tar.gz"

if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  for archive in "${STAGING}/mysql.sql.gz" "${STAGING}/minio-product-media.tar.gz"; do
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$archive" -out "${archive}.enc"
    rm -f -- "$archive"
  done
fi

mv -T -- "$STAGING" "$TARGET_DIR"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name "[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z" -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
printf 'Backup completed: %s\n' "$TARGET_DIR"
