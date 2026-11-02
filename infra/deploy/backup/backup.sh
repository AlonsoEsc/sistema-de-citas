#!/bin/sh
# Respaldo completo de la base en formato custom de pg_dump (comprimido y restaurable por
# tablas). Verifica que el archivo se pueda leer y borra los que superan la retencion.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
stamp="$(date +%Y%m%d-%H%M%S)"
target="${BACKUP_DIR}/citas-${stamp}.dump"
partial="${target}.partial"

mkdir -p "$BACKUP_DIR"
echo "[backup] $(date -Iseconds) iniciando ${target}"

pg_dump --format=custom --compress=9 --no-owner --file="$partial"
# Un respaldo que pg_restore no puede listar no sirve: se descarta y se avisa con error.
pg_restore --list "$partial" > /dev/null
mv "$partial" "$target"

size="$(du -h "$target" | cut -f1)"
echo "[backup] listo ${target} (${size})"

find "$BACKUP_DIR" -name 'citas-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete \
  | sed 's/^/[backup] borrado por retencion: /'
