import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { badRequest } from "../../shared/errors.js";
import { idParamsSchema, optionalPhoneSchema } from "../../shared/schemas.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { tenantOf } from "../tenancy/tenant-context.js";
import * as appointments from "./appointment.service.js";

const tags = ["citas"];
const security = [{ bearerAuth: [] }];
const manage = adminAccess(PERMISSIONS.appointmentsManage);

// El panel actual carga ~3 anios de citas; se reducira cuando pagine (fase 3 de la hoja de ruta).
const MAX_RANGE_DAYS = 1100;

const statusSchema = z.enum([
  "pending",
  "confirmed",
  "cancelled",
  "no_show",
  "completed",
]);

export async function appointmentRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    "/appointments",
    {
      preHandler: adminAccess(),
      schema: {
        tags,
        security,
        querystring: z.object({
          from: z.iso.datetime({ offset: true }),
          to: z.iso.datetime({ offset: true }),
          staffId: z.uuid().optional(),
        }),
      },
    },
    async (request) => {
      const from = new Date(request.query.from);
      const to = new Date(request.query.to);
      if (to <= from) {
        throw badRequest("El rango de fechas es invalido", "INVALID_RANGE");
      }
      if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
        throw badRequest(
          `El rango maximo es de ${MAX_RANGE_DAYS} dias`,
          "RANGE_TOO_LARGE",
        );
      }
      return appointments.listAppointments(scopeOf(request), {
        from,
        to,
        staffId: request.query.staffId,
      });
    },
  );

  routes.post(
    "/appointments",
    {
      preHandler: manage,
      schema: {
        tags,
        security,
        summary: "Agenda una cita desde el panel (sin restriccion de jornada)",
        body: z
          .object({
            staffId: z.uuid(),
            serviceIds: z.array(z.uuid()).min(1),
            customerId: z.uuid().optional(),
            customer: z
              .object({
                fullName: z.string().trim().min(2),
                phone: optionalPhoneSchema,
                email: z.email().optional(),
              })
              .optional(),
            startAt: z.iso.datetime({ offset: true }),
          })
          .refine(
            (body) => body.customerId || body.customer,
            "Debes enviar customerId o los datos del cliente",
          ),
      },
    },
    async (request) => {
      const scope = scopeOf(request);
      const tenant = await tenantOf(request);
      return appointments.createAppointment(scope, tenant, {
        ...request.body,
        source: "admin",
        actor: "staff",
        startAt: new Date(request.body.startAt),
      });
    },
  );

  routes.patch(
    "/appointments/:id/status",
    {
      preHandler: manage,
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: z.object({
          status: statusSchema,
          suppressNotifications: z.boolean().optional().default(false),
        }),
      },
    },
    async (request) => {
      const scope = scopeOf(request);
      const tenant = await tenantOf(request);
      return appointments.updateAppointmentStatus(
        scope,
        tenant,
        request.params.id,
        request.body.status,
        { notify: !request.body.suppressNotifications },
      );
    },
  );

  routes.patch(
    "/appointments/:id/reschedule",
    {
      preHandler: manage,
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: z.object({ startAt: z.iso.datetime({ offset: true }) }),
      },
    },
    async (request) => {
      const scope = scopeOf(request);
      const tenant = await tenantOf(request);
      return appointments.rescheduleAppointment(
        scope,
        tenant,
        request.params.id,
        new Date(request.body.startAt),
        { actor: "staff" },
      );
    },
  );

  routes.delete(
    "/appointments/:id",
    { preHandler: manage, schema: { tags, security, params: idParamsSchema } },
    async (request) =>
      appointments.deleteAppointment(scopeOf(request), request.params.id),
  );

  routes.post(
    "/appointments/:id/notify-test",
    {
      preHandler: manage,
      schema: {
        tags,
        security,
        params: idParamsSchema,
        body: z
          .object({
            channels: z.array(z.enum(["email", "sms", "whatsapp"])).optional(),
          })
          .default({}),
      },
    },
    async (request) => {
      const scope = scopeOf(request);
      const tenant = await tenantOf(request);
      return appointments.queueTestNotification(
        scope,
        tenant,
        request.params.id,
        request.body.channels,
      );
    },
  );
}
