# Agenda de Citas (nombre provisional)

SaaS multi-tenant de reservas para negocios con agenda: barberías, salones de belleza,
clínicas, consultorios médicos y odontológicos. Cada negocio (tenant) tiene su panel
administrativo, su portal público de reservas y recordatorios por email, SMS o WhatsApp.

El nombre comercial es configurable: `VITE_PRODUCT_NAME` en los frontends y
`PRODUCT_NAME` en la API (valor por defecto en `packages/shared`).

## Estructura

| Carpeta            | Contenido                                                                 |
| ------------------ | ------------------------------------------------------------------------- |
| `apps/api`         | API REST: Fastify 5, Prisma 7, PostgreSQL                                 |
| `apps/worker`      | Procesa la cola de notificaciones (outbox) con reintentos y recordatorios |
| `apps/web-admin`   | Panel del negocio: React 18, Vite, Tailwind 4, TanStack Query             |
| `apps/web-booking` | Portal público de reservas con verificación de teléfono por OTP           |
| `packages/db`      | Schema de Prisma, migraciones, seed y cliente con aislamiento por tenant  |
| `packages/shared`  | Código compartido entre apps                                              |
| `infra/messaging`  | Evolution API (WhatsApp Cloud API) y Chatwoot para desarrollo (WSL)       |
| `infra/docker`     | Dockerfile multi-etapa y Caddyfile de producción                          |
| `infra/deploy`     | Compose de producción, despliegue, respaldos (ver `docs/operations.md`)   |
| `docs/`            | Endpoints, integración de WhatsApp, arquitectura y hoja de ruta           |

## Requisitos

- Node.js 24 o superior
- PostgreSQL 16, local o con `docker compose up -d`

## Arranque local

```bash
cp .env.example .env          # y ajusta DATABASE_URL, JWT_SECRET y ENCRYPTION_KEY
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

| Servicio            | URL                                 |
| ------------------- | ----------------------------------- |
| API (y `/docs`)     | http://localhost:4000               |
| Panel del negocio   | http://localhost:5173               |
| Registro            | http://localhost:5173/registro      |
| Panel de plataforma | http://localhost:5173/plataforma    |
| Reservas            | http://localhost:5174/demo-barberia |

### Arranque automático en Windows (opcional)

`infra/messaging/start-messaging.ps1` levanta Evolution y Chatwoot en WSL y
`infra/start-application.ps1` ejecuta `npm run dev` en segundo plano (si el puerto 4000 está
libre). Se pueden lanzar al iniciar sesión desde un `.cmd` en la carpeta Inicio de Windows.
En desarrollo el worker no envía mensajes reales (`WORKER_SEND_MODE=log`).

El seed crea el negocio `demo-barberia` con tres usuarios de prueba (owner, staff y
recepción). Las credenciales están en `packages/db/prisma/seed.ts` y el panel las precarga
solo en modo desarrollo.

## Modelo comercial

- **Registro autónomo** en `/registro`: crea el negocio con 14 días de prueba en el plan
  Negocio, servicios sugeridos según el rubro y plantillas de mensajes.
- **Planes** Básico, Negocio y Clínica (19/39/79 USD al mes) con límite de profesionales,
  cupo mensual de WhatsApp y funciones. Al vencer la prueba o el pago (con 3 días de
  gracia) el panel queda en solo lectura y el portal deja de recibir reservas.
- **Cobro manual** desde el panel de plataforma: registrar un pago extiende la
  suscripción. Está preparado para conectar una pasarela (`Subscription.provider`).
- **Rubro configurable**: el vocabulario (cliente/paciente, servicio/tratamiento...) y los
  servicios sugeridos salen de `packages/shared/src/industries.ts`.
- **Portal por URL**: cada negocio recibe reservas en `{PUBLIC_BOOKING_BASE_URL}/{slug}`.
  El servidor que publique `web-booking` debe redirigir cualquier ruta a `index.html`.

Los administradores de plataforma no se registran por la web:

```bash
npm run platform:admin -- --email ops@tudominio.com --name "Operaciones"
```

## Scripts

| Comando          | Qué hace                                        |
| ---------------- | ----------------------------------------------- |
| `npm run dev`    | API, worker, panel y portal en paralelo         |
| `npm run check`  | Lint, typecheck y tests (lo mismo que corre CI) |
| `npm run format` | Aplica Prettier a todo el repositorio           |
| `npm run build`  | Compila todos los workspaces                    |

Los tests de la API son de integración y necesitan PostgreSQL con las migraciones
aplicadas.

## Seguridad

- Sesiones del navegador en cookies `httpOnly`, `SameSite=Lax` y `Secure` (el token no
  queda al alcance del JavaScript); las escrituras exigen además el encabezado
  `X-Requested-With` contra CSRF. La cookie del portal se limita a `/public/{negocio}`.
- Tokens con tipo y caducidad; los de cliente del portal no sirven contra la API de
  administración. El portal solo identifica al cliente por el teléfono verificado.
- Límites de intentos por IP, compartidos entre instancias con `REDIS_URL`.
- Permisos por rol en cada ruta (`appointments.manage`, `customers.manage`,
  `settings.manage`, etc.). El rol `owner` tiene todos.
- OTP limitado por IP y por teléfono; el código nunca se devuelve fuera de desarrollo.
- En producción la API no arranca con `JWT_SECRET` débil y CORS queda restringido a
  `ADMIN_BASE_URL`, `PUBLIC_BOOKING_BASE_URL` o `CORS_ORIGINS`.
- Todo acceso a datos de un negocio pasa por `forTenant()`, que filtra lecturas y fuerza
  el `tenantId` en escrituras. Además, PostgreSQL aplica Row Level Security con el rol
  `citas_app`: aunque el filtro fallara, la base no entrega filas de otro negocio.
- Derechos de datos: el negocio exporta todo en JSON y elimina clientes; el cliente borra
  sus datos desde el portal.
- Las URLs de integraciones se validan contra SSRF (HTTPS y sin redes privadas en
  producción).
- Fuera de producción el worker no contacta proveedores (`WORKER_SEND_MODE=log`).

## Documentación

- [Hoja de ruta](docs/roadmap.md)
- [Operación: despliegue, respaldos, monitoreo](docs/operations.md)
- [Arquitectura del backend](docs/architecture/backend.md)
- [Endpoints de la API](docs/api/endpoints.md) (OpenAPI en `/docs`)
- [Integración de WhatsApp y Chatwoot](docs/whatsapp-integration.md)
- [Visión original de la arquitectura](docs/architecture/vision-original.md)
