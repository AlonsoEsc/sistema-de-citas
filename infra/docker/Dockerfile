# syntax=docker/dockerfile:1.7
# Imagen unica del monorepo con un target por servicio:
#   api, worker  -> procesos Node en produccion (solo dependencias de produccion)
#   tools        -> migraciones y scripts de administracion (prisma CLI, tsx)
#   web          -> Caddy con el panel y el portal ya compilados
# Construir desde la raiz del repo: docker build -f infra/docker/Dockerfile --target api .

ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false

# Manifiestos primero: la capa de dependencias se reutiliza mientras no cambien.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web-admin/package.json apps/web-admin/
COPY apps/web-booking/package.json apps/web-booking/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

FROM manifests AS deps
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
ARG APP_VERSION=dev
# Variables publicas de los frontends: Vite las incrusta al compilar.
ARG VITE_API_URL
ARG VITE_PRODUCT_NAME
ARG VITE_SENTRY_DSN
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_FACEBOOK_APP_ID
ARG VITE_ADMIN_URL
ARG VITE_LEGAL_NAME
ARG VITE_LEGAL_EMAIL
ARG VITE_LEGAL_ADDRESS
ENV VITE_APP_VERSION=${APP_VERSION}
RUN npm run db:generate \
 && npm run build -w @citas/api -w @citas/worker \
 && npm run build -w @citas/web-admin -w @citas/web-booking

FROM manifests AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev -w @citas/api -w @citas/worker -w @citas/db -w @citas/shared

FROM base AS node-runtime
ENV NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY --from=prod-deps /app/node_modules ./node_modules
USER node

FROM node-runtime AS api
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health > /dev/null || exit 1
CMD ["node", "--enable-source-maps", "apps/api/dist/index.js"]

FROM node-runtime AS worker
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
ENV WORKER_HEARTBEAT_FILE=/tmp/worker-heartbeat
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD node apps/worker/dist/healthcheck.js
CMD ["node", "--enable-source-maps", "apps/worker/dist/index.js"]

# Migraciones (`npm run db:deploy`) y altas de superadmin (`npm run platform:admin`).
FROM build AS tools
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "db:deploy"]

FROM caddy:2.10-alpine AS web
COPY infra/docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web-admin/dist /srv/admin
COPY --from=build /app/apps/web-booking/dist /srv/booking
