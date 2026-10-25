import type { WhatsappMessage } from "@citas/db";
import { maskPhone } from "@citas/shared/phone";
import type { TenantScope } from "../../shared/tenant-scope.js";

/** Ventana de citas que se muestran junto a cada conversacion. */
const APPOINTMENT_LOOKBACK_DAYS = 30;
const MAX_SESSIONS = 100;

function messageTime(message: WhatsappMessage) {
  return message.receivedAt ?? message.sentAt ?? message.createdAt;
}

/** Bandeja de WhatsApp del negocio: conversaciones por telefono con su proxima cita. */
export async function listConversations(
  { db, tenantId }: TenantScope,
  options: { limit: number },
) {
  const [recentMessages, sessions, connection] = await Promise.all([
    db.whatsappMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: options.limit,
    }),
    db.whatsappConversationSession.findMany({
      orderBy: { updatedAt: "desc" },
      take: MAX_SESSIONS,
    }),
    db.integrationConnection.findUnique({
      where: {
        tenantId_provider_scopeKey: {
          tenantId,
          provider: "whatsapp",
          scopeKey: "tenant",
        },
      },
    }),
  ]);

  const messages = [...recentMessages].reverse();
  const phones = [
    ...new Set([
      ...sessions.map((session) => session.phone),
      ...messages.map((message) => message.phone),
    ]),
  ];
  const [customers, appointments] = phones.length
    ? await Promise.all([
        db.customer.findMany({ where: { phone: { in: phones } } }),
        db.appointment.findMany({
          where: {
            customer: { phone: { in: phones } },
            startAt: {
              gte: new Date(
                Date.now() - APPOINTMENT_LOOKBACK_DAYS * 86_400_000,
              ),
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
    customers.flatMap((customer) =>
      customer.phone ? [[customer.phone, customer] as const] : [],
    ),
  );
  const sessionByPhone = new Map(
    sessions.map((session) => [session.phone, session]),
  );
  const messagesByPhone = new Map<string, WhatsappMessage[]>();
  for (const message of messages) {
    messagesByPhone.set(message.phone, [
      ...(messagesByPhone.get(message.phone) ?? []),
      message,
    ]);
  }

  const conversations = phones.map((phone) => {
    const customer = customerByPhone.get(phone);
    const session = sessionByPhone.get(phone);
    const rows = messagesByPhone.get(phone) ?? [];
    const related = appointments.filter(
      (appointment) => appointment.customer.phone === phone,
    );
    const nextAppointment =
      related.find(
        (appointment) =>
          appointment.startAt.getTime() >= Date.now() &&
          appointment.status !== "cancelled",
      ) ?? related.at(-1);
    const lastMessage = rows.at(-1);

    return {
      id: session?.id ?? `phone:${phone}`,
      customerId: customer?.id ?? null,
      customerName: customer?.fullName ?? "Contacto de WhatsApp",
      phoneMasked: maskPhone(phone),
      state: session?.state ?? "idle",
      humanHandoff: session?.humanHandoff ?? false,
      lastMessageAt:
        (lastMessage
          ? messageTime(lastMessage)
          : session?.updatedAt
        )?.toISOString() ?? null,
      messages: rows.map((message) => ({
        id: message.id,
        direction: message.direction,
        content: message.content ?? "",
        eventType: message.eventType,
        deliveryStatus: message.deliveryStatus,
        createdAt: messageTime(message).toISOString(),
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
  });

  conversations.sort((left, right) =>
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
}
