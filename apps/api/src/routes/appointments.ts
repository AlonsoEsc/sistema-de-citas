import type { FastifyInstance } from "fastify";
import type { NotificationChannel } from "@citas/db";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";
import {
  createAppointment,
  rescheduleAppointment,
} from "../services/appointment-service.js";
import { badRequest, notFound } from "../lib/http-error.js";
import { queueAppointmentNotifications } from "../services/notification-service.js";

const createAppointmentSchema = z.object({
  staffId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1),
  customerId: z.string().uuid().optional(),
  customer: z
    .object({
      fullName: z.string().min(2),
      phone: z.string().optional(),
      email: z.string().email().optional(),
    })
    .optional(),
  startAt: z.string().datetime(),
  currency: z.string().length(3).optional(),
});

export async function appointmentRoutes(app: FastifyInstance) {
  app.get("/appointments", { preHandler: [requireAuth] }, async (request) => {
    const query = z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        staffId: z.string().uuid().optional(),
      })
      .parse(request.query);

    return app.prisma.appointment.findMany({
      where: {
        tenantId: request.tenantId,
        staffId: query.staffId,
        startAt: { gte: new Date(query.from) },
        endAt: { lte: new Date(query.to) },
      },
      include: {
        customer: true,
        staff: true,
        services: {
          include: { service: true },
        },
      },
      orderBy: { startAt: "asc" },
    });
  });

  app.post(
    "/appointments",
    {
      preHandler: [
        requireAuth,
        requirePermission(PERMISSIONS.appointmentsManage),
      ],
    },
    async (request) => {
      const payload = createAppointmentSchema.parse(request.body);
      return createAppointment(app.prisma, {
        tenantId: request.tenantId as string,
        source: "admin",
        staffId: payload.staffId,
        customerId: payload.customerId,
        customer: payload.customer,
        startAt: new Date(payload.startAt),
        serviceIds: payload.serviceIds,
        currency: payload.currency,
      });
    },
  );

  app.patch(
    "/appointments/:id/status",
    {
      preHandler: [
        requireAuth,
        requirePermission(PERMISSIONS.appointmentsManage),
      ],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = z
        .object({
          status: z.enum([
            "pending",
            "confirmed",
            "cancelled",
            "no_show",
            "completed",
          ]),
          suppressNotifications: z.boolean().optional().default(false),
        })
        .parse(request.body);

      const existing = await app.prisma.appointment.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Cita no encontrada");
      }

      const updated = await app.prisma.appointment.update({
        where: { id: existing.id },
        data: { status: payload.status },
        include: {
          customer: true,
          staff: true,
          services: { include: { service: true } },
        },
      });
      if (
        !payload.suppressNotifications &&
        (payload.status === "confirmed" || payload.status === "cancelled")
      ) {
        await queueAppointmentNotifications(
          app.prisma,
          updated,
          `appointment.${payload.status}`,
          { idempotencySuffix: updated.updatedAt.toISOString() },
        );
      }
      return updated;
    },
  );

  app.patch(
    "/appointments/:id/reschedule",
    {
      preHandler: [
        requireAuth,
        requirePermission(PERMISSIONS.appointmentsManage),
      ],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = z
        .object({ startAt: z.string().datetime() })
        .parse(request.body);
      return rescheduleAppointment(
        app.prisma,
        request.tenantId as string,
        params.id,
        new Date(payload.startAt),
      );
    },
  );

  app.delete(
    "/appointments/:id",
    {
      preHandler: [
        requireAuth,
        requirePermission(PERMISSIONS.appointmentsManage),
      ],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);

      const existing = await app.prisma.appointment.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
      });
      if (!existing) {
        throw notFound("Cita no encontrada");
      }

      if (existing.status === "completed" || existing.status === "no_show") {
        throw badRequest(
          "No puedes eliminar citas historicas (completed/no_show)",
        );
      }

      await app.prisma.appointment.delete({
        where: { id: existing.id },
      });

      return {
        ok: true,
        deletedId: existing.id,
      };
    },
  );

  app.post(
    "/appointments/:id/notify-test",
    {
      preHandler: [
        requireAuth,
        requirePermission(PERMISSIONS.appointmentsManage),
      ],
    },
    async (request) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const payload = z
        .object({
          channels: z.array(z.enum(["email", "sms", "whatsapp"])).optional(),
        })
        .parse(request.body ?? {});

      const appointment = await app.prisma.appointment.findFirst({
        where: { id: params.id, tenantId: request.tenantId },
        include: {
          customer: true,
          staff: true,
          tenant: true,
        },
      });

      if (!appointment) {
        throw notFound("Cita no encontrada");
      }

      const entitlements = await app.prisma.tenantEntitlement.findMany({
        where: {
          tenantId: request.tenantId,
          key: {
            in: [
              "notifications.email.enabled",
              "notifications.sms.enabled",
              "notifications.whatsapp.enabled",
            ],
          },
        },
      });

      const entitlementMap = new Map<string, unknown>(
        entitlements.map((item: { key: string; valueJson: unknown }) => [
          item.key,
          item.valueJson,
        ]),
      );

      const enabledChannels = new Set<NotificationChannel>();
      if (
        (
          entitlementMap.get("notifications.email.enabled") as
            | { enabled?: boolean }
            | undefined
        )?.enabled !== false
      ) {
        enabledChannels.add("email");
      }
      if (
        (
          entitlementMap.get("notifications.sms.enabled") as
            | { enabled?: boolean }
            | undefined
        )?.enabled === true
      ) {
        enabledChannels.add("sms");
      }
      if (
        (
          entitlementMap.get("notifications.whatsapp.enabled") as
            | { enabled?: boolean }
            | undefined
        )?.enabled === true
      ) {
        enabledChannels.add("whatsapp");
      }

      const requestedChannels = payload.channels ?? Array.from(enabledChannels);
      const allowedChannels = requestedChannels.filter((channel) =>
        enabledChannels.has(channel),
      );
      const channelsWithContact = allowedChannels.filter((channel) => {
        if (channel === "email") {
          return Boolean(appointment.customer.email);
        }
        return Boolean(appointment.customer.phone);
      });

      if (!channelsWithContact.length) {
        throw badRequest(
          "No hay canales disponibles para esta cita. Revisa entitlements y contacto del cliente.",
          "NO_CHANNEL_AVAILABLE",
        );
      }

      const rows = await Promise.all(
        channelsWithContact.map((channel) =>
          app.prisma.notificationOutbox.create({
            data: {
              tenantId: request.tenantId as string,
              channel,
              eventType: "appointment.manual_test",
              to:
                channel === "email"
                  ? (appointment.customer.email ?? "missing-email")
                  : (appointment.customer.phone ?? "missing-phone"),
              payloadJson: {
                appointmentId: appointment.id,
                customerName: appointment.customer.fullName,
                staffName: appointment.staff.displayName,
                startAt: appointment.startAt.toISOString(),
                status: appointment.status,
              },
            },
          }),
        ),
      );

      return {
        ok: true,
        appointmentId: appointment.id,
        channels: rows.map((row) => row.channel),
        outboxIds: rows.map((row) => row.id),
        message:
          "Notificacion de prueba encolada. Si el worker esta activo, cambiara de pending a sent en segundos.",
      };
    },
  );
}
