-- AlterEnum
ALTER TYPE "OutboxStatus" ADD VALUE 'skipped';

-- AlterTable
ALTER TABLE "NotificationTemplate" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

