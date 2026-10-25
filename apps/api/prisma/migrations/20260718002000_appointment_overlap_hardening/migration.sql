CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_no_overlap'
  ) THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "appointments_no_overlap"
      EXCLUDE USING gist (
        "tenantId" WITH =,
        "staffId" WITH =,
        tsrange("startAt", "endAt", '[)') WITH &&
      )
      WHERE ("status" IN ('pending', 'confirmed'));
  END IF;
END $$;
