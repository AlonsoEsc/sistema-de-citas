CREATE TABLE "AppointmentFeedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "source" TEXT NOT NULL DEFAULT 'whatsapp',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentFeedback_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "AppointmentFeedback_appointmentId_key"
  ON "AppointmentFeedback"("appointmentId");
CREATE INDEX "AppointmentFeedback_tenantId_rating_createdAt_idx"
  ON "AppointmentFeedback"("tenantId", "rating", "createdAt");

ALTER TABLE "AppointmentFeedback"
  ADD CONSTRAINT "AppointmentFeedback_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentFeedback"
  ADD CONSTRAINT "AppointmentFeedback_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
