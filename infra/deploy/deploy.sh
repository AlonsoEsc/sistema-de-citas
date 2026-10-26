#!/bin/sh
# Despliega una version en el servidor. Lo ejecuta el flujo de GitHub por SSH, o a mano:
#   ./deploy.sh <etiqueta> [<etiqueta-web>]
#
# 1. Respalda la base antes de tocar nada.
# 2. Descarga las imagenes, aplica migraciones y reinicia los servicios.
# 3. Espera a que la API responda /ready; si no, vuelve a la version anterior.
#
# Las migraciones no se revierten solas: deben ser compatibles con la version anterior
# (agregar antes de quitar). Ver docs/operations.md.
set -eu
cd "$(dirname "$0")"

tag="${1:?Indica la etiqueta de las imagenes}"
web_tag="${2:-$tag}"
previous="$(cat .deployed 2>/dev/null || true)"

up() {
  IMAGE_TAG="$1" WEB_IMAGE_TAG="$2" docker compose pull --quiet migrate api worker web
  IMAGE_TAG="$1" WEB_IMAGE_TAG="$2" docker compose up -d --remove-orphans
}

ready() {
  attempts=0
  while [ "$attempts" -lt 30 ]; do
    if docker compose exec -T api wget -qO- http://127.0.0.1:4000/ready > /dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 5
  done
  return 1
}

if docker compose ps --status running --services 2>/dev/null | grep -q '^postgres$'; then
  echo "[deploy] respaldo previo"
  docker compose run --rm --no-deps --entrypoint /bin/sh backup /backup/backup.sh
fi

echo "[deploy] desplegando ${tag} (web ${web_tag})"
up "$tag" "$web_tag"

if ready; then
  echo "${tag} ${web_tag}" > .deployed
  docker image prune -f > /dev/null
  echo "[deploy] listo: ${tag}"
  exit 0
fi

echo "[deploy] ERROR: la API no quedo lista" >&2
docker compose logs --tail=80 api migrate >&2 || true
if [ -n "$previous" ]; then
  # shellcheck disable=SC2086
  set -- $previous
  echo "[deploy] volviendo a ${1} (web ${2})" >&2
  up "$1" "$2"
fi
exit 1
