#!/bin/sh
# Restauracion real (DESTRUCTIVA): reemplaza la base actual por un respaldo.
# Uso desde infra/deploy, con api y worker detenidos:
#   docker compose stop api worker
#   docker compose run --rm backup /bin/sh /backup/restore.sh /backups/citas-AAAAMMDD-HHMMSS.dump
#   docker compose up -d
set -eu

file="${1:?Indica el archivo de respaldo a restaurar}"
if [ "${CONFIRM_RESTORE:-}" != "si" ]; then
  echo "Esto BORRA la base ${PGDATABASE} y la reemplaza por ${file}."
  echo "Vuelve a ejecutar con -e CONFIRM_RESTORE=si para continuar."
  exit 1
fi

pg_restore --list "$file" > /dev/null
# En un servidor nuevo el rol de RLS aun no existe y las politicas del respaldo lo necesitan.
psql --dbname="$PGDATABASE" --quiet --command="DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'citas_app') THEN CREATE ROLE citas_app NOLOGIN; END IF; END \$\$;"
echo "[restore] restaurando ${file} en ${PGDATABASE}"
pg_restore --no-owner --clean --if-exists --exit-on-error --single-transaction \
  --dbname="$PGDATABASE" "$file"
echo "[restore] listo"
