#!/bin/sh
# Prueba de restauracion: restaura el respaldo mas reciente en una base temporal, revisa que
# tenga datos y migraciones aplicadas, y la borra. Un respaldo sin probar no es un respaldo.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
latest="$(ls -1t "$BACKUP_DIR"/citas-*.dump 2>/dev/null | head -n 1 || true)"
if [ -z "$latest" ]; then
  echo "[restore-test] ERROR: no hay respaldos en ${BACKUP_DIR}" >&2
  exit 1
fi

scratch="restore_test_$(date +%s)"
cleanup() {
  dropdb --if-exists "$scratch" > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[restore-test] $(date -Iseconds) restaurando ${latest} en ${scratch}"
createdb "$scratch"
pg_restore --no-owner --exit-on-error --dbname="$scratch" "$latest"

query() {
  psql --dbname="$scratch" --tuples-only --no-align --command="$1"
}
migrations="$(query 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')"
tenants="$(query 'SELECT count(*) FROM "Tenant"')"
policies="$(query "SELECT count(*) FROM pg_policies WHERE policyname IN ('tenant_isolation', 'tenant_members')")"

echo "[restore-test] migraciones=${migrations} negocios=${tenants} politicas_rls=${policies}"
if [ "$migrations" -lt 1 ] || [ "$policies" -lt 1 ]; then
  echo "[restore-test] ERROR: el respaldo restaurado esta incompleto" >&2
  exit 1
fi
echo "[restore-test] OK"
