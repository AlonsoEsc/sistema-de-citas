-- Row Level Security: segunda barrera de aislamiento entre negocios.
--
-- El cliente de negocio de la API (forTenant) ejecuta cada consulta con
--   SET LOCAL ROLE citas_app y SET LOCAL app.tenant_id = '<negocio>'
-- y estas politicas solo dejan ver y escribir filas de ese negocio. Las tareas de sistema
-- (login, plataforma, worker, webhooks) usan el rol dueno de las tablas, al que RLS no
-- se aplica. Sin app.tenant_id fijado, citas_app no ve ninguna fila.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'citas_app') THEN
    CREATE ROLE citas_app NOLOGIN;
  END IF;
END
$$;

-- El usuario de conexion debe poder cambiar a citas_app con SET ROLE.
GRANT citas_app TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO citas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO citas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO citas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO citas_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO citas_app;

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

-- Tablas con tenantId.

ALTER TABLE "TenantSetting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantSetting" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "TenantUser" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantUser" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserRole" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Staff" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "StaffSchedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StaffSchedule" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Service" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Customer" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Appointment" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Subscription" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Invitation" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "TenantEntitlement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantEntitlement" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "NotificationTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationTemplate" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "NotificationOutbox" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationOutbox" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "WhatsappMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsappMessage" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "WhatsappConversationSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WhatsappConversationSession" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "AppointmentFeedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AppointmentFeedback" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "CustomerAuthSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerAuthSession" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IntegrationConnection" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "ScheduledReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScheduledReport" TO citas_app
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

-- El propio negocio.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant" TO citas_app
  USING ("id" = app_current_tenant())
  WITH CHECK ("id" = app_current_tenant());

-- Servicios de una cita: visibles si la cita es visible (esa consulta ya pasa por RLS).
ALTER TABLE "AppointmentService" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AppointmentService" TO citas_app
  USING (EXISTS (SELECT 1 FROM "Appointment" a WHERE a."id" = "appointmentId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Appointment" a WHERE a."id" = "appointmentId"));

-- Usuarios: el negocio solo ve a los miembros de su equipo.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_members ON "User" TO citas_app
  USING (EXISTS (SELECT 1 FROM "TenantUser" tu WHERE tu."userId" = "User"."id"));
