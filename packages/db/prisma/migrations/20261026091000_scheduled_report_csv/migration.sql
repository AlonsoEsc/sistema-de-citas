-- AlterTable
ALTER TABLE "ScheduledReport" ALTER COLUMN "format" SET DEFAULT 'csv';


-- Los reportes siempre se enviaron como CSV; se corrige el formato guardado.
UPDATE "ScheduledReport" SET "format" = 'csv';
