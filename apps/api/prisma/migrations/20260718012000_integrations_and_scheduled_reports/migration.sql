CREATE TYPE "IntegrationProvider" AS ENUM ('google_calendar', 'whatsapp', 'email');
CREATE TYPE "IntegrationScope" AS ENUM ('tenant', 'staff');
CREATE TYPE "IntegrationStatus" AS ENUM ('disconnected', 'pending', 'connected', 'error');

ALTER TABLE "Appointment"
  ADD COLUMN "googleCalendarId" TEXT,
  ADD COLUMN "googleEventId" TEXT,
  ADD COLUMN "externalSyncJson" JSONB;

CREATE INDEX "Appointment_tenantId_googleEventId_idx"
  ON "Appointment"("tenantId", "googleEventId");

CREATE TABLE "IntegrationConnection" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "staffId" UUID,
  "provider" "IntegrationProvider" NOT NULL,
  "scope" "IntegrationScope" NOT NULL DEFAULT 'tenant',
  "scopeKey" TEXT NOT NULL,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'disconnected',
  "accountEmail" TEXT,
  "externalId" TEXT,
  "accessTokenEnc" TEXT,
  "refreshTokenEnc" TEXT,
  "expiresAt" TIMESTAMP(3),
  "configEnc" TEXT,
  "metadataJson" JSONB,
  "lastError" TEXT,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_scopeKey_key"
  ON "IntegrationConnection"("tenantId", "provider", "scopeKey");

CREATE INDEX "IntegrationConnection_tenantId_provider_status_idx"
  ON "IntegrationConnection"("tenantId", "provider", "status");

CREATE INDEX "IntegrationConnection_tenantId_staffId_idx"
  ON "IntegrationConnection"("tenantId", "staffId");

ALTER TABLE "IntegrationConnection"
  ADD CONSTRAINT "IntegrationConnection_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationConnection"
  ADD CONSTRAINT "IntegrationConnection_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ScheduledReport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "recipientsJson" JSONB NOT NULL,
  "format" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSentAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledReport_tenantId_enabled_idx"
  ON "ScheduledReport"("tenantId", "enabled");

CREATE INDEX "ScheduledReport_enabled_nextRunAt_idx"
  ON "ScheduledReport"("enabled", "nextRunAt");

ALTER TABLE "ScheduledReport"
  ADD CONSTRAINT "ScheduledReport_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
