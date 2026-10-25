# Scalable SaaS for Barbershops/Salons/Clinics (React + Node.js + Postgres)
Goal: One shared platform (core) + optional modules (WhatsApp / Email / SMS) enabled by plan (feature flags).
Stack: React (web) + Node.js (API) + Postgres (DB) + Redis (optional) + Background jobs.

---

## 1) High-level architecture

### Core concepts
- **Multi-tenant**: each business = `tenant`
- **RBAC**: roles/permissions per tenant
- **Feature flags / entitlements**: plan decides enabled modules & limits
- **Outbox pattern** for notifications: WhatsApp/Email/SMS are “channels” plugged into a single queue
- **Background workers**: reminders, sending notifications, retries, cleanup

### Services (start as a modular monolith; split later if needed)
- `api` (Node.js): REST API (modular)
- `worker` (Node.js): jobs + outbox processing
- `web-admin` (React): owner/admin dashboard
- `web-booking` (React): public booking portal (can also be hosted as a route in admin app)
- `postgres`, `redis` (optional)

> Why modular monolith first: cheapest to build/operate, easiest to ship. You still design boundaries so you can split into microservices later.

---

## 2) Repository structure (monorepo)

### Recommended: PNPM + Turborepo (fast, scalable)

repo/
├─ apps/
│  ├─ web-admin/                 # React app (admin + staff)
│  ├─ web-booking/               # React app (public booking portal)
│  ├─ api/                       # Node.js API (Fastify/Nest/Express)
│  └─ worker/                    # Node.js worker (BullMQ/Agenda/Quartz-like)
├─ packages/
│  ├─ ui/                        # Shared UI components (optional)
│  ├─ shared/                    # Shared types, utils, validation schemas
│  ├─ db/                        # Prisma/Knex migrations + schema
│  └─ config/                    # ESLint, TSConfig, env validation
├─ infra/
│  ├─ docker/
│  ├─ k8s/                       # optional later
│  └─ terraform/                 # optional later
├─ docs/
│  ├─ product/
│  ├─ api/
│  └─ adr/                       # architecture decisions
├─ .env.example
├─ docker-compose.yml
└─ README.md

---

## 3) Backend design (Node.js API)

### Option A (recommended for speed + structure): NestJS
- Modules map perfectly to your “core + modules” strategy.
- Clean DI, guards, interceptors, pipes.

### Option B: Fastify + TypeScript (lighter, very fast)
- You build your own module structure.
- Great performance, less boilerplate than Nest.

Below assumes **NestJS**, but the folder concepts apply to any framework.

apps/api/src/
├─ main.ts
├─ app.module.ts
├─ common/
│  ├─ auth/                      # JWT, guards, decorators
│  ├─ tenancy/                   # tenant resolution middleware
│  ├─ rbac/                      # permission checks
│  ├─ filters/                   # error handling
│  ├─ validation/                # Zod/Joi pipes
│  ├─ feature-flags/             # entitlements checks
│  └─ utils/
├─ modules/
│  ├─ tenants/
│  ├─ users/
│  ├─ staff/
│  ├─ services/
│  ├─ customers/
│  ├─ appointments/
│  ├─ payments/                  # optional
│  ├─ reports/
│  ├─ plans/                     # subscriptions & entitlements
│  └─ notifications/
│     ├─ notifications.module.ts
│     ├─ templates/
│     ├─ outbox/
│     └─ channels/
│        ├─ email/
│        ├─ sms/
│        └─ whatsapp/
└─ prisma/ or db/

### API boundaries (domain modules)
- Tenants: create/update settings, policies, branding
- Users/RBAC: users, roles, permissions
- Staff: staff profiles, schedules, commission settings
- Services: catalog of services (duration, price)
- Customers: profiles, notes, history
- Appointments: booking lifecycle
- Plans/Entitlements: plan name, staff limits, enabled modules
- Notifications: templates + outbox queue + channel adapters
- Reports: occupancy, revenue, no-shows, staff performance

---

## 4) Tenancy strategy (Postgres)

### Start with: shared DB + `tenant_id` column on all tenant-owned tables
Pros: cheapest, easiest. Works for hundreds/thousands of tenants.

Rules:
- Every request resolves `tenant_id` (from subdomain, header, or token claim)
- Every query scopes by `tenant_id`
- Add DB constraints to prevent cross-tenant leaks

Tenant resolution patterns:
1) Subdomain: `barberiaX.tuapp.com`
2) Custom domain later: `reservas.barberiaX.com` (CNAME)
3) Header-based for internal/testing: `x-tenant-id`

---

## 5) Database schema (MVP) — Postgres

Use Prisma or Knex migrations. Below is a schema outline (tables & key columns).

### Core
- tenants
  - id (uuid), name, slug, timezone, currency, created_at
- tenant_settings
  - tenant_id (pk/fk), cancel_policy_minutes, booking_window_days, branding_json

### Auth/RBAC
- users
  - id, email, password_hash, is_active, created_at
- tenant_users
  - tenant_id, user_id, status, created_at
- roles
  - id, tenant_id, name
- permissions
  - id, key (global), description
- role_permissions
  - role_id, permission_id
- user_roles
  - tenant_id, user_id, role_id

### Business data
- staff
  - id, tenant_id, display_name, phone, commission_type, commission_value, active
- staff_schedules
  - id, tenant_id, staff_id, day_of_week, start_time, end_time, break_json
- services
  - id, tenant_id, name, duration_minutes, price_cents, active
- customers
  - id, tenant_id, full_name, phone, email, notes, created_at

### Appointments
- appointments
  - id, tenant_id
  - customer_id, staff_id
  - status (pending|confirmed|cancelled|no_show|completed)
  - start_at, end_at
  - price_cents, currency
  - source (admin|portal)
  - created_at, updated_at
- appointment_services (if multiple services per appointment)
  - appointment_id, service_id, duration_minutes, price_cents

### Plans / entitlements
- plans (global or per tenant)
  - id, code, name, price_cents, billing_period (monthly)
- tenant_subscriptions
  - tenant_id, plan_id, status, current_period_end, cancel_at_period_end
- tenant_entitlements
  - tenant_id, key, value_json
  - examples:
    - key=staff.limit, value={"n":3}
    - key=notifications.whatsapp.enabled, value={"enabled":true}

### Notifications (Outbox pattern)
- notification_templates
  - id, tenant_id, channel (email|sms|whatsapp)
  - event_type (appointment.created|appointment.reminder_24h|...)
  - subject (nullable), body (string), variables_json
- notification_outbox
  - id, tenant_id
  - channel (email|sms|whatsapp)
  - event_type
  - to (string), payload_json
  - status (pending|processing|sent|failed)
  - attempts (int), next_retry_at (timestamp)
  - created_at, sent_at, last_error

### Indexing (important)
- appointments(tenant_id, start_at)
- appointments(tenant_id, staff_id, start_at)
- customers(tenant_id, phone)
- notification_outbox(status, next_retry_at)
- tenant_users(tenant_id, user_id)

---

## 6) Feature flags / Entitlements (how you sell 2 products without duplicating code)

Implement a simple guard:
- On each tenant request, load entitlements (cached)
- Validate feature access + limits

Examples:
- `notifications.whatsapp.enabled = true/false`
- `notifications.email.enabled = true/false`
- `staff.limit = 1/3/unlimited`
- `reports.advanced.enabled = true/false`
- `payments.deposits.enabled = true/false`

In code:
- Middleware loads entitlements -> `req.entitlements`
- Decorator/guard `@RequireFeature('notifications.whatsapp.enabled')`

---

## 7) Background jobs (Worker)

apps/worker/src/
├─ main.ts
├─ jobs/
│  ├─ reminder-24h.job.ts
│  ├─ reminder-2h.job.ts
│  ├─ outbox-dispatch.job.ts
│  ├─ outbox-retry.job.ts
│  └─ cleanup.job.ts
├─ channels/
│  ├─ email.sender.ts
│  ├─ sms.sender.ts
│  └─ whatsapp.sender.ts
├─ db/
└─ config/

### Job engine options
- BullMQ + Redis (recommended for reliability and scale)
- Or Postgres-based job queue (less infra) but usually more work

### Reminder flow (best practice)
1) Worker finds appointments for tomorrow (24h reminders)
2) For each appointment, create outbox rows for enabled channels
3) Dispatcher consumes outbox rows and sends
4) Update status + retries with exponential backoff

---

## 8) Frontend apps (React)

### web-admin (Owner/Staff)
apps/web-admin/src/
├─ app/
│  ├─ routes/
│  ├─ layouts/
│  ├─ components/
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ calendar/
│  │  ├─ staff/
│  │  ├─ services/
│  │  ├─ customers/
│  │  ├─ reports/
│  │  └─ settings/
│  ├─ api/                       # typed client
│  ├─ store/                     # zustand/redux
│  └─ utils/
└─ main.tsx

### web-booking (Public portal)
apps/web-booking/src/
├─ app/
│  ├─ routes/
│  ├─ components/
│  ├─ features/
│  │  ├─ booking/
│  │  ├─ confirmation/
│  │  └─ cancel-reschedule/
│  └─ api/
└─ main.tsx

Frontend notes:
- Use React Query (TanStack Query) for caching
- Use Zod for client-side validation
- Calendar UI: FullCalendar or a custom scheduler
- Multi-tenant: booking portal resolves tenant by slug/subdomain

---

## 9) API endpoint map (MVP)

Auth
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout

Tenants
- GET /tenants/me
- PATCH /tenants/me/settings

Staff
- GET /staff
- POST /staff
- PATCH /staff/:id
- GET /staff/:id/schedule
- PUT /staff/:id/schedule

Services
- GET /services
- POST /services
- PATCH /services/:id

Customers
- GET /customers?search=
- POST /customers
- PATCH /customers/:id

Appointments
- GET /appointments?from=&to=&staffId=
- POST /appointments
- PATCH /appointments/:id/status
- PATCH /appointments/:id/reschedule

Booking portal
- GET /public/:tenantSlug/services
- GET /public/:tenantSlug/staff
- GET /public/:tenantSlug/availability?date=
- POST /public/:tenantSlug/book

Notifications (admin)
- GET /notifications/templates
- PUT /notifications/templates/:id

Plans
- GET /plans
- GET /subscription
- POST /subscription/upgrade
- GET /entitlements

---

## 10) Security + reliability checklist (do this from day 1)

- Tenant scoping in every query (mandatory)
- Row Level Security (RLS) optional (nice-to-have later)
- Input validation everywhere (Zod/Joi)
- Rate limiting for public endpoints
- Audit log for appointment status changes (optional but useful)
- Soft delete for customers/staff (optional)
- Unique constraints to prevent double-booking:
  - enforce availability logic in transaction
- Observability:
  - structured logs
  - correlation id per request

---

## 11) Payments & subscriptions (optional MVP, recommended soon)
- Start simple:
  - Manual subscription status (admin toggles)
  - Track plan + limits
- Later integrate Stripe / local methods:
  - store subscription state in `tenant_subscriptions`

---

## 12) Local dev (Docker Compose)

docker-compose.yml (concept)
- postgres
- redis
- api
- worker

Also add:
- pgadmin (optional)
- mailhog (email testing)

---

## 13) “Two products” packaging (what you sell)

### Product A (With WhatsApp)
- Plan enables: `notifications.whatsapp.enabled=true`
- Focus message: reduce no-shows with WhatsApp confirmations

### Product B (Without WhatsApp)
- Plans enable: email (and optional SMS)
- Focus message: professional booking portal + reports + commissions

Same core. Different entitlements, pricing, and positioning.

---

## 14) Implementation order (fastest path to revenue)

Week 1–2:
- Tenancy + auth + staff + services + appointments
- Booking portal + availability

Week 3:
- Outbox + email reminders + templates
- Basic reports (appointments count, revenue simple)

Week 4–5:
- WhatsApp channel integration + template sending + retries
- No-show tracking + staff performance report

---

## 15) Tech choices (most rentable)

Backend:
- NestJS + Prisma (fast dev) OR Fastify + Prisma (fast runtime)
DB:
- Postgres
Queue:
- BullMQ + Redis (recommended)
Frontend:
- React + Vite + TanStack Query

---

## 16) Minimal “rentable” MVP definition (what must ship)
- Booking portal link (Instagram-ready)
- Calendar in admin
- Staff/services management
- Reminders (email or WhatsApp)
- No-show/cancellation handling
- Basic revenue report per staff

Ship this first. Everything else is upsell.

---