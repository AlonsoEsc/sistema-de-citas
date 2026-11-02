# Operación

Cómo desplegar, respaldar, monitorear y recuperar el sistema en un VPS con Docker.

## Arquitectura de producción

```
Internet ──443──> web (Caddy) ──> /srv/admin    panel       app.dominio
                               ──> /srv/booking  portal      reservas.dominio
                               ──> api:4000      API         api.dominio
                  api ──┐
                  worker├──> postgres (sin puertos publicados)
                  backup┘
```

| Servicio   | Imagen / target      | Qué hace                                                     |
| ---------- | -------------------- | ------------------------------------------------------------ |
| `web`      | `web`                | HTTPS automático (Let's Encrypt), estáticos y proxy a la API |
| `api`      | `api`                | API Fastify. `/health` (vivo) y `/ready` (con base)          |
| `worker`   | `worker`             | Avisos, recordatorios y reportes. Healthcheck por latido     |
| `migrate`  | `tools`              | `prisma migrate deploy` y termina; api y worker lo esperan   |
| `postgres` | `postgres:16-alpine` | Base de datos, volumen `postgres_data`                       |
| `backup`   | `postgres:16-alpine` | `pg_dump` diario y prueba semanal de restauración            |

Todo está en `infra/deploy/` (compose, `.env.example`, `deploy.sh`, scripts de respaldo) y
`infra/docker/` (Dockerfile y Caddyfile).

## Primer despliegue

1. **Servidor**: Ubuntu 24.04 con 2 vCPU y 4 GB (alcanza para cientos de negocios). Instala
   Docker Engine y el plugin compose. Abre solo los puertos 22, 80 y 443.
2. **DNS**: registros A de `app`, `reservas` y `api` apuntando a la IP del servidor.
3. **Archivos**: copia `infra/deploy/` a `/opt/citas` y crea el `.env`:

   ```bash
   cp .env.example .env
   openssl rand -base64 32   # POSTGRES_PASSWORD
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -base64 32   # ENCRYPTION_KEY (no cambiarla nunca: cifra credenciales)
   ```

   Guarda una copia de `ENCRYPTION_KEY` fuera del servidor: sin ella no se pueden leer las
   credenciales de integraciones guardadas.

4. **Registro de imágenes**: las imágenes de GitHub (`ghcr.io`) son privadas. En el servidor:
   `docker login ghcr.io -u <usuario>` con un token con permiso `read:packages`.
5. **Arranque**: `sh deploy.sh <etiqueta>` (por ejemplo `sha-1a2b3c4` o `v1.0.0`).
6. **Superadmin**:

   ```bash
   docker compose run --rm migrate npm run platform:admin -- --email tu@correo.com --name "Tu nombre"
   ```

7. **Monitoreo**: crea en un servicio de uptime (UptimeRobot, Better Stack) un chequeo cada
   minuto a `https://api.dominio/ready` y otro a `https://app.dominio`. Configura
   `SENTRY_DSN` (proyecto Node) y `VITE_SENTRY_DSN` (proyecto React) si usas Sentry.

## Despliegue continuo

`.github/workflows/deploy.yml`:

- **push a `main`** → publica imágenes `sha-<commit>` y despliega en **staging**.
- **etiqueta `vX.Y.Z`** → publica `vX.Y.Z` y despliega en **producción**. Configura el entorno
  `production` de GitHub con revisores obligatorios para aprobar cada salida.

Cada entorno de GitHub necesita las variables y secretos listados al inicio del flujo. Sin
`DEPLOY_HOST`, el flujo solo publica imágenes.

`deploy.sh` respalda la base, actualiza los servicios y espera `/ready`. Si la API no queda
lista en 2,5 minutos, vuelve sola a la versión anterior.

### Migraciones compatibles

Las migraciones se aplican antes de arrancar la nueva versión y **no se revierten solas**.
Toda migración debe funcionar con la versión anterior de la app (expandir y luego contraer):

1. Agregar columnas nuevas como opcionales o con valor por defecto.
2. Desplegar el código que las usa.
3. En una versión posterior, quitar lo viejo.

Nunca renombrar ni borrar una columna en el mismo despliegue que deja de usarla.

## Staging

Es el mismo compose en otro servidor (o carpeta y dominios propios) con
`DEPLOY_ENVIRONMENT=staging` y `WORKER_SEND_MODE=log`, para que no salgan mensajes reales.
Nunca copies datos de producción a staging sin anonimizarlos.

## Respaldos

- `backup` ejecuta `backup.sh` según `BACKUP_SCHEDULE` (por defecto 03:00): `pg_dump` en
  formato custom, verificado con `pg_restore --list`, en `BACKUP_HOST_DIR`. Conserva
  `BACKUP_RETENTION_DAYS` días (14).
- `restore-test.sh` corre cada domingo (`RESTORE_TEST_SCHEDULE`): restaura el último
  respaldo en una base temporal, comprueba migraciones y políticas de RLS, y la borra. El CI
  hace la misma prueba en cada cambio.
- **Copia fuera del servidor (obligatoria)**: un respaldo en el mismo disco no protege si se
  pierde el servidor. Sincroniza `BACKUP_HOST_DIR` a un almacenamiento externo, por ejemplo
  con `rclone` y un bucket S3/Backblaze en el cron del host:

  ```bash
  15 3 * * * rclone sync /opt/citas/backups remoto:citas-backups --max-age 30d
  ```

Revisa los logs de vez en cuando: `docker compose logs backup`.

### Restaurar

```bash
docker compose stop api worker
docker compose run --rm -e CONFIRM_RESTORE=si --entrypoint /bin/sh backup \
  /backup/restore.sh /backups/citas-AAAAMMDD-HHMMSS.dump
docker compose up -d
```

En un servidor nuevo: levanta solo `postgres`, restaura y luego `sh deploy.sh <etiqueta>`.

## Aislamiento entre negocios (RLS)

Además del filtro de la aplicación, PostgreSQL aplica Row Level Security:

- El rol `citas_app` (sin privilegios de dueño) solo ve filas cuyo `tenantId` coincide con
  `app.tenant_id`. Sin negocio fijado no ve nada.
- El cliente de negocio de la API (`forTenant`) corre cada consulta en una transacción con
  `SET LOCAL ROLE citas_app` y el negocio de la petición.
- Las tareas de sistema (login, plataforma, worker, webhooks) usan el rol dueño de las tablas.

**Costo medido** (Postgres local, 400 consultas, 2026-10-27): una consulta pasa de ~0,4 ms
a ~0,9 ms de mediana porque va dentro de su propia transacción con `SET LOCAL`; 200
consultas en paralelo, de 64 a 71 ms. Una petición típica del panel (5 a 15 consultas) suma
3 a 8 ms. Si alguna ruta hace muchas consultas seguidas, agrúpalas en una transacción
interactiva (`db.$transaction(async (tx) => …)`): el contexto se fija una sola vez.

Al crear una tabla con `tenantId`, agrégala a `TENANT_SCOPED_MODELS` y crea su política en la
migración (`ENABLE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation`). El test de
aislamiento falla si falta en la lista.

## Escalar la API

Con una sola instancia no hace falta nada más. Para correr varias réplicas de `api`, define
`REDIS_URL` (por ejemplo, un servicio `redis:7-alpine` en el mismo compose): los límites de
intentos por IP se comparten entre réplicas. Si Redis cae, la API sigue respondiendo y los
límites se suspenden hasta que vuelva (se registra un aviso).

## Monitoreo y registros

- **Errores**: Sentry en API, worker, panel y portal; solo con DSN y sin datos personales
  (sin encabezados, cuerpos ni usuarios).
- **Salud**: `GET /health` (proceso vivo) y `GET /ready` (responde la base, 503 si no).
  Docker reinicia contenedores que fallan su healthcheck; el del worker revisa que haya
  completado un ciclo en los últimos minutos.
- **Logs**: `docker compose logs -f api worker`. La API registra en JSON con `reqId`; los
  tokens de las URLs y el encabezado `Authorization` se ocultan.

## Checklist antes de abrir al público

- [ ] Términos y privacidad revisados por un abogado; `LEGAL_NAME`, `LEGAL_EMAIL` y
      `LEGAL_ADDRESS` configurados.
- [ ] Copia externa de respaldos funcionando y una restauración probada a mano.
- [ ] Monitores de uptime y alertas a un correo o teléfono que alguien lea.
- [ ] `ENCRYPTION_KEY` y `.env` guardados en un gestor de contraseñas.
- [ ] Plantillas de WhatsApp aprobadas por Meta (ver `docs/whatsapp-integration.md`).
