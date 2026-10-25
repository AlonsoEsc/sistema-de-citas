ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'chatwoot';

CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

ALTER TABLE "Customer"
  ADD COLUMN "whatsappOptInAt" TIMESTAMP(3),
  ADD COLUMN "whatsappOptOutAt" TIMESTAMP(3);

ALTER TABLE "NotificationOutbox"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerMessageId" TEXT,
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "readAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "NotificationOutbox_idempotencyKey_key"
  ON "NotificationOutbox"("idempotencyKey");

DROP INDEX IF EXISTS "NotificationOutbox_status_nextRetryAt_idx";
CREATE INDEX "NotificationOutbox_status_scheduledFor_nextRetryAt_idx"
  ON "NotificationOutbox"("status", "scheduledFor", "nextRetryAt");
CREATE INDEX "NotificationOutbox_tenantId_providerMessageId_idx"
  ON "NotificationOutbox"("tenantId", "providerMessageId");

CREATE TABLE "WhatsappMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "outboxId" UUID,
  "appointmentId" UUID,
  "direction" "MessageDirection" NOT NULL,
  "provider" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "phone" TEXT NOT NULL,
  "content" TEXT,
  "eventType" TEXT,
  "deliveryStatus" "MessageDeliveryStatus" NOT NULL DEFAULT 'queued',
  "rawJson" JSONB,
  "receivedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappMessage_outboxId_key" ON "WhatsappMessage"("outboxId");
CREATE UNIQUE INDEX "WhatsappMessage_tenantId_provider_externalMessageId_key"
  ON "WhatsappMessage"("tenantId", "provider", "externalMessageId");
CREATE INDEX "WhatsappMessage_tenantId_phone_createdAt_idx"
  ON "WhatsappMessage"("tenantId", "phone", "createdAt");
CREATE INDEX "WhatsappMessage_tenantId_appointmentId_idx"
  ON "WhatsappMessage"("tenantId", "appointmentId");

ALTER TABLE "WhatsappMessage"
  ADD CONSTRAINT "WhatsappMessage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsappMessage"
  ADD CONSTRAINT "WhatsappMessage_outboxId_fkey"
  FOREIGN KEY ("outboxId") REFERENCES "NotificationOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsappConversationSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'idle',
  "contextJson" JSONB,
  "humanHandoff" BOOLEAN NOT NULL DEFAULT false,
  "chatwootContactId" TEXT,
  "chatwootConversationId" TEXT,
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappConversationSession_tenantId_phone_key"
  ON "WhatsappConversationSession"("tenantId", "phone");
CREATE INDEX "WhatsappConversationSession_tenantId_humanHandoff_updatedAt_idx"
  ON "WhatsappConversationSession"("tenantId", "humanHandoff", "updatedAt");

ALTER TABLE "WhatsappConversationSession"
  ADD CONSTRAINT "WhatsappConversationSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
