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
| `infra/messaging`  | Evolution API (WhatsApp Cloud API) y Chatwoot para atención humana        |
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

| Servicio | URL                   |
| -------- | --------------------- |
| API      | http://localhost:4000 |
| Panel    | http://localhost:5173 |
| Reservas | http://localhost:5174 |

El seed crea el negocio `demo-barberia` con tres usuarios de prueba (owner, staff y
recepción). Las credenciales están en `packages/db/prisma/seed.ts` y el panel las precarga
solo en modo desarrollo.

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

- Tokens de administración con tipo y caducidad; los de cliente del portal no sirven
  contra la API de administración.
- Permisos por rol en cada ruta (`appointments.manage`, `customers.manage`,
  `settings.manage`, etc.). El rol `owner` tiene todos.
- OTP limitado por IP y por teléfono; el código nunca se devuelve fuera de desarrollo.
- En producción la API no arranca con `JWT_SECRET` débil y CORS queda restringido a
  `ADMIN_BASE_URL`, `PUBLIC_BOOKING_BASE_URL` o `CORS_ORIGINS`.
- Todo acceso a datos de un negocio pasa por `forTenant()`, que filtra lecturas y fuerza
  el `tenantId` en escrituras.
- Las URLs de integraciones se validan contra SSRF (HTTPS y sin redes privadas en
  producción).
- Fuera de producción el worker no contacta proveedores (`WORKER_SEND_MODE=log`).

## Documentación

- [Hoja de ruta](docs/roadmap.md)
- [Arquitectura del backend](docs/architecture/backend.md)
- [Endpoints de la API](docs/api/endpoints.md) (OpenAPI en `/docs`)
- [Integración de WhatsApp y Chatwoot](docs/whatsapp-integration.md)
- [Visión original de la arquitectura](docs/architecture/vision-original.md)
