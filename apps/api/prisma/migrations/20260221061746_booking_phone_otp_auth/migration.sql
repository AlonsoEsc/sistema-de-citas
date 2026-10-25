-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('manual', 'google', 'facebook');

-- CreateTable
CREATE TABLE "CustomerAuthSession" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerUserId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "otpCodeHash" TEXT NOT NULL,
    "otpExpiresAt" TIMESTAMP(3) NOT NULL,
    "otpVerifiedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAuthSession_tenantId_phone_createdAt_idx" ON "CustomerAuthSession"("tenantId", "phone", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerAuthSession_tenantId_otpExpiresAt_idx" ON "CustomerAuthSession"("tenantId", "otpExpiresAt");

-- AddForeignKey
ALTER TABLE "CustomerAuthSession" ADD CONSTRAINT "CustomerAuthSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
