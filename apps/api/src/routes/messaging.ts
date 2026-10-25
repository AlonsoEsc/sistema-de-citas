import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PERMISSIONS, requireAuth, requirePermission } from "../lib/auth.js";

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) {
    return `••••${digits}`;
  }
  return `•••• ${digits.slice(-4)}`;
}

export async function messagingRoutes(app: FastifyInstance) {
  app.get(
    "/messaging/conversations",
    {
      preHandler: [
        requireAuth,
        requirePermission(PERMISSIONS.appointmentsManage),
      ],
    },
    async (request) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(50).max(1000).default(500),
        })
        .parse(request.query);

      const [messagesDescending, sessions, connection] = await Promise.all([
        app.prisma.whatsappMessage.findMany({
          where: { tenantId: request.tenantId },
          orderBy: { createdAt: "desc" },
          take: query.limit,
        }),
        app.prisma.whatsappConversationSession.findMany({
          where: { tenantId: request.tenantId },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
        app.prisma.integrationConnection.findUnique({
          where: {
            tenantId_provider_scopeKey: {
              tenantId: request.tenantId as string,
              provider: "whatsapp",
              scopeKey: "tenant",
            },
          },
        }),
      ]);

      const messages = messagesDescending.reverse();
      const phones = Array.from(
        new Set([
          ...sessions.map((session) => session.phone),
          ...messages.map((message) => message.phone),
        ]),
      );

      const [customers, appointments] = phones.length
        ? await Promise.all([
            app.prisma.customer.findMany({
              where: {
                tenantId: request.tenantId,
                phone: { in: phones },
              },
            }),
            app.prisma.appointment.findMany({
              where: {
                tenantId: request.tenantId,
                customer: { phone: { in: phones } },
                startAt: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
              },
              include: {
                customer: true,
                staff: true,
                services: { include: { service: true } },
              },
              orderBy: { startAt: "asc" },
            }),
          ])
        : [[], []];

      const customerByPhone = new Map(
        customers
          .filter((customer) => customer.phone)
          .map((customer) => [customer.phone as string, customer]),
      );
      const sessionByPhone = new Map(
        sessions.map((session) => [session.phone, session]),
      );
      const messagesByPhone = new Map<
        string,
        Array<(typeof messages)[number]>
      >();

      for (const message of messages) {
        const rows = messagesByPhone.get(message.phone) ?? [];
        rows.push(message);
        messagesByPhone.set(message.phone, rows);
      }

      const conversations = phones
        .map((phone) => {
          const customer = customerByPhone.get(phone);
          const session = sessionByPhone.get(phone);
          const rows = messagesByPhone.get(phone) ?? [];
          const relatedAppointments = appointments.filter(
            (appointment) => appointment.customer.phone === phone,
          );
          const nextAppointment =
            relatedAppointments.find(
              (appointment) =>
                appointment.startAt.getTime() >= Date.now() &&
                appointment.status !== "cancelled",
            ) ?? relatedAppointments.at(-1);
          const lastMessage = rows.at(-1);

          return {
            id: session?.id ?? `phone:${phone}`,
            customerId: customer?.id ?? null,
            customerName: customer?.fullName ?? "Contacto de WhatsApp",
            phoneMasked: maskPhone(phone),
            state: session?.state ?? "idle",
            humanHandoff: session?.humanHandoff ?? false,
            lastMessageAt:
              lastMessage?.receivedAt?.toISOString() ??
              lastMessage?.sentAt?.toISOString() ??
              lastMessage?.createdAt.toISOString() ??
              session?.updatedAt.toISOString() ??
              null,
            messages: rows.map((message) => ({
              id: message.id,
              direction: message.direction,
              content: message.content ?? "",
              eventType: message.eventType,
              deliveryStatus: message.deliveryStatus,
              createdAt:
                message.receivedAt?.toISOString() ??
                message.sentAt?.toISOString() ??
                message.createdAt.toISOString(),
            })),
            appointment: nextAppointment
              ? {
                  id: nextAppointment.id,
                  status: nextAppointment.status,
                  startAt: nextAppointment.startAt.toISOString(),
                  endAt: nextAppointment.endAt.toISOString(),
                  priceCents: nextAppointment.priceCents,
                  currency: nextAppointment.currency,
                  staffName: nextAppointment.staff.displayName,
                  services: nextAppointment.services.map(
                    (entry) => entry.service.name,
                  ),
                }
              : null,
          };
        })
        .sort((left, right) =>
          String(right.lastMessageAt ?? "").localeCompare(
            String(left.lastMessageAt ?? ""),
          ),
        );

      return {
        paused: true,
        pauseReason: "manual_user_pause",
        providerStatus: connection?.status ?? "disconnected",
        conversations,
      };
    },
  );
}
