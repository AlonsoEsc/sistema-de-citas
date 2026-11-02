-- Fase 2: rubro, suscripciones y pagos, equipo (invitaciones y tokens) y bitacora.
-- Los ALTER ... DROP DEFAULT alinean ids con el schema (Prisma genera los UUID).

-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('barbershop', 'beauty_salon', 'nail_salon', 'spa', 'medical_clinic', 'dental', 'psychology', 'physiotherapy', 'veterinary', 'fitness', 'other');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled');

-- CreateEnum
CREATE TYPE "UserTokenType" AS ENUM ('password_reset', 'email_verification');

-- DropForeignKey
ALTER TABLE "TenantSubscription" DROP CONSTRAINT "TenantSubscription_planId_fkey";

-- DropForeignKey
ALTER TABLE "TenantSubscription" DROP CONSTRAINT "TenantSubscription_tenantId_fkey";

-- AlterTable
ALTER TABLE "AppointmentFeedback" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IntegrationConnection" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "featuresJson" JSONB,
ADD COLUMN     "maxStaff" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsappMessagesPerMonth" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ScheduledReport" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "industry" "Industry" NOT NULL DEFAULT 'other',
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'es-SV',
ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'active',
ALTER COLUMN "timezone" SET DEFAULT 'America/El_Salvador',
ALTER COLUMN "currency" SET DEFAULT 'USD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WhatsappConversationSession" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WhatsappMessage" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- Datos de referencia: planes comerciales (precios en centavos de USD).
INSERT INTO "Plan" ("id", "code", "name", "priceCents", "currency", "billingPeriod", "maxStaff", "whatsappMessagesPerMonth", "featuresJson", "active", "sortOrder")
VALUES
  (gen_random_uuid(), 'basico', 'Básico', 1900, 'USD', 'monthly', 1, 100,
   '{"notifications.email.enabled":{"enabled":true},"notifications.whatsapp.enabled":{"enabled":true},"notifications.sms.enabled":{"enabled":false},"reports.advanced.enabled":{"enabled":false},"whatsapp.assistant.enabled":{"enabled":false}}', true, 1),
  (gen_random_uuid(), 'negocio', 'Negocio', 3900, 'USD', 'monthly', 5, 400,
   '{"notifications.email.enabled":{"enabled":true},"notifications.whatsapp.enabled":{"enabled":true},"notifications.sms.enabled":{"enabled":false},"reports.advanced.enabled":{"enabled":true},"whatsapp.assistant.enabled":{"enabled":false}}', true, 2),
  (gen_random_uuid(), 'clinica', 'Clínica', 7900, 'USD', 'monthly', 15, 1000,
   '{"notifications.email.enabled":{"enabled":true},"notifications.whatsapp.enabled":{"enabled":true},"notifications.sms.enabled":{"enabled":false},"reports.advanced.enabled":{"enabled":true},"whatsapp.assistant.enabled":{"enabled":true}}', true, 3)
ON CONFLICT ("code") DO NOTHING;

-- Negocios que ya pagaban: quedan activos en el plan Negocio hasta el fin de su periodo.
INSERT INTO "Subscription" ("id", "tenantId", "planId", "status", "currentPeriodStart", "currentPeriodEnd", "updatedAt")
SELECT DISTINCT ON (ts."tenantId")
  gen_random_uuid(), ts."tenantId", (SELECT "id" FROM "Plan" WHERE "code" = 'negocio'),
  'active', NOW(), COALESCE(ts."currentPeriodEnd", NOW() + INTERVAL '30 days'), NOW()
FROM "TenantSubscription" ts
WHERE ts."status" = 'active'
ORDER BY ts."tenantId", ts."currentPeriodEnd" DESC NULLS LAST;

-- El resto de negocios existentes empieza una prueba de 14 dias.
INSERT INTO "Subscription" ("id", "tenantId", "planId", "status", "trialEndsAt", "updatedAt")
SELECT gen_random_uuid(), t."id", (SELECT "id" FROM "Plan" WHERE "code" = 'negocio'),
  'trialing', NOW() + INTERVAL '14 days', NOW()
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "Subscription" s WHERE s."tenantId" = t."id");

-- Plan heredado del prototipo: deja de ofrecerse.
UPDATE "Plan" SET "active" = false WHERE "code" NOT IN ('basico', 'negocio', 'clinica');

-- DropTable
DROP TABLE "TenantSubscription";

-- CreateTable
CREATE TABLE "UserToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "UserTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadataJson" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserToken_userId_type_idx" ON "UserToken"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_email_idx" ON "Invitation"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Payment_tenantId_paidAt_idx" ON "Payment"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

