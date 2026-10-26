#!/bin/sh
# Programa el respaldo diario y la prueba semanal de restauracion con el cron del contenedor.
set -eu

# El cron que se usa es el de busybox de las imagenes Alpine de Postgres.
if ! command -v crond > /dev/null 2>&1; then
  echo "[backup] ERROR: esta imagen no tiene crond; usa postgres:16-alpine (POSTGRES_IMAGE)" >&2
  exit 1
fi
mkdir -p /etc/crontabs
cat > /etc/crontabs/root <<CRON
${BACKUP_SCHEDULE} /bin/sh /backup/backup.sh >> /proc/1/fd/1 2>&1
${RESTORE_TEST_SCHEDULE} /bin/sh /backup/restore-test.sh >> /proc/1/fd/1 2>&1
CRON

echo "[backup] respaldo: '${BACKUP_SCHEDULE}', prueba de restauracion: '${RESTORE_TEST_SCHEDULE}' (${TZ:-UTC})"
exec crond -f -l 8
