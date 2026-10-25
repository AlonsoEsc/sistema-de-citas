# Sistema de Citas SaaS (Barberias, Salones y Clinicas)

Implementacion basada en `SaaSBase.md` con arquitectura multi-tenant y producto listo para comercializar:

- `apps/api`: API Fastify + Prisma + Postgres
- `apps/worker`: worker para outbox y reintentos de notificaciones
- `apps/web-admin`: dashboard administrativo profesional (agenda, catalogos, reportes, settings)
- `apps/web-booking`: portal publico de reservas (mobile-first)

## Lo que ya incluye

- Multi-tenant por `tenant_id`
- Auth JWT con login por `tenantSlug`
- RBAC base + entitlements por plan
- Modulos CRUD: staff, servicios, clientes
- Agenda con creacion/reagendado y control anti doble-reserva
- Portal publico `/public/:tenantSlug/*`
- Login booking sin password con OTP por telefono
- Opcional: social login Google/Facebook + OTP de telefono
- Booking oculto hasta login verificado y bloqueo por telefono con cita activa
- Tras login en booking se muestra panel con dos opciones: hacer cita o cancelar cita
- Outbox pattern para notificaciones (email/sms/whatsapp)
- Worker con reintentos exponenciales
- Evolution API multi-tenant con webhooks autenticados y estados de entrega
- Asistente de WhatsApp para agendar, confirmar, cancelar y reagendar
- Chatwoot para handoff y respuestas de agentes humanos
- Reportes base (citas, ingresos, no-show, rendimiento por staff)

## Stack

- Backend: Node.js + Fastify + Prisma
- DB: Postgres
- Frontend: React + Vite + MUI + TanStack Query + FullCalendar
- Jobs: Worker Node.js (polling outbox)

## Arranque local

1. Levanta infraestructura:

```bash
docker compose up -d
```

2. Crea variables de entorno:

```bash
copy .env.example .env
```

3. Instala dependencias:

```bash
npm install
```

4. Genera cliente Prisma, migra y seed:

```bash
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run prisma:migrate -- --name init
npm --workspace apps/api run prisma:seed
```

5. (Recomendado) aplica hardening de DB anti-overlap a nivel Postgres:

Archivo: `apps/api/prisma/hardening.sql`

6. Inicia todo:

```bash
npm run dev
```

La instalación de Evolution API, Chatwoot, plantillas oficiales y webhooks está
documentada en [`docs/whatsapp-integration.md`](docs/whatsapp-integration.md).

Puertos:

- API: `http://localhost:4000`
- Admin: `http://localhost:5173`
- Booking: `http://localhost:5174`

## Credenciales demo seed

- Tenant slug para todos: `demo-barberia`
- Owner/Admin:
  - Email: `admin@demo.com`
  - Password: `Admin1234!`
- Staff:
  - Email: `staff@demo.com`
  - Password: `Staff1234!`
- Recepción:
  - Email: `recepcion@demo.com`
  - Password: `Recepcion1234!`

## Endpoints clave

- Auth: `/auth/login`
- Staff: `/staff`
- Services: `/services`
- Customers: `/customers`
- Appointments: `/appointments`
- Public booking: `/public/:tenantSlug/services`, `/public/:tenantSlug/staff`, `/public/:tenantSlug/availability`, `/public/:tenantSlug/book`
- Public auth: `/public/:tenantSlug/auth/start`, `/public/:tenantSlug/auth/verify`

## Notas de comercializacion

- Ya soporta estrategia de dos productos via entitlements:
  - Con WhatsApp (`notifications.whatsapp.enabled=true`)
  - Sin WhatsApp (email/sms)
- Puedes vender primero con esta base y luego ampliar:
  - Stripe/suscripciones automaticas
  - WhatsApp BSP real
  - reportes avanzados y auditoria
