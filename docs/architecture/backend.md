# Arquitectura del backend

## Paquetes

| Paquete           | Responsabilidad                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db`     | Schema de Prisma, migraciones, seed y cliente. Exporta `createPrismaClient()` y `forTenant()`.                                                                          |
| `packages/shared` | Código sin dependencias de framework: nombre del producto, teléfonos, fechas con zona horaria, textos de notificación, cifrado y forma de las configuraciones cifradas. |
| `apps/api`        | API HTTP (Fastify).                                                                                                                                                     |
| `apps/worker`     | Envío de la cola de notificaciones y recordatorios programados.                                                                                                         |

La API y el worker se empaquetan con tsup para producción; los paquetes del workspace se
publican como TypeScript y quedan incluidos en el bundle.

## Módulos de la API (`apps/api/src/modules`)

| Módulo          | Contenido                                                                |
| --------------- | ------------------------------------------------------------------------ |
| `auth`          | Login, tokens, guardias (`requireAuth`, `requirePermission`) y permisos. |
| `tenancy`       | Contexto del negocio (zona horaria, moneda, políticas) y entitlements.   |
| `catalog`       | Profesionales, horarios semanales y servicios.                           |
| `customers`     | Clientes del negocio.                                                    |
| `scheduling`    | Disponibilidad y reglas de citas (crear, reagendar, cancelar, estados).  |
| `portal`        | Portal público: verificación por OTP y reservas de clientes.             |
| `notifications` | Encolado de notificaciones (outbox) y plantillas.                        |
| `integrations`  | Evolution (WhatsApp), Chatwoot, Google Calendar.                         |
| `messaging`     | Webhooks entrantes, bandeja de conversaciones y asistente de WhatsApp.   |
| `reports`       | Resumen de métricas y reportes programados.                              |
| `billing`       | Planes y suscripción (solo lectura hasta integrar cobros).               |

Cada módulo sigue la misma forma:

- `*.routes.ts`: declara rutas con esquemas Zod (`params`, `querystring`, `body`,
  `response`). La validación, los tipos del handler y el documento OpenAPI salen del mismo
  esquema. Los handlers no contienen reglas de negocio.
- `*.service.ts`: reglas de negocio. Reciben un `TenantScope` y datos ya validados; no
  conocen Fastify.
- `*.schemas.ts`: esquemas reutilizados entre rutas y servicios.

No hay una capa de repositorios separada: el cliente `TenantDb` ya es la abstracción de
acceso a datos y aplica el aislamiento por negocio. Si una consulta crece en complejidad,
se extrae a una función con nombre dentro del servicio.

## Aislamiento entre negocios

`forTenant(prisma, tenantId)` devuelve un cliente de Prisma que, para todos los modelos con
`tenantId`:

- agrega `tenantId` a todo `where` (lecturas, `update`, `delete`, `count`...);
- fuerza `tenantId` en `create`, `createMany` y `upsert`, y lanza `CrossTenantWriteError`
  si alguien intenta escribir con otro.

Las rutas de administración obtienen el scope desde `requireAuth`; las del portal, desde el
slug del negocio. Un test falla si se agrega un modelo con `tenantId` sin registrarlo en
`TENANT_SCOPED_MODELS`.

Solo usan el cliente sin filtrar los procesos de plataforma que cruzan negocios a
propósito: login (busca el negocio por slug), webhooks (resuelven el negocio por la
conexión) y el worker.

## Reglas de agenda

- Las jornadas (`HH:mm`) y fechas (`AAAA-MM-DD`) son hora local del negocio; los instantes
  se guardan en UTC. Nada depende de la zona horaria del servidor.
- Un cliente (portal o WhatsApp) solo reserva espacios libres de la jornada dentro de la
  ventana de reserva. El personal puede agendar fuera de jornada.
- Nunca hay dos citas activas del mismo profesional solapadas: lo valida el servicio y lo
  garantiza la restricción `appointments_no_overlap` de PostgreSQL (responde 409).

## Errores

Todas las respuestas de error tienen la forma `{ error, message, detail? }`, donde `error`
es un código estable (`SLOT_NOT_AVAILABLE`, `PERMISSION_DENIED`, `VALIDATION_ERROR`...).

## Documentación de endpoints

La referencia de endpoints es el documento OpenAPI que genera la API en `/docs` (activo
fuera de producción o con `API_DOCS_ENABLED=true`).
