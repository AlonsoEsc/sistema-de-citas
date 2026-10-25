import type {
  BookingSource,
  NotificationChannel,
  Prisma,
  PrismaClient,
} from "@citas/db";
import { badRequest, conflict, notFound } from "../lib/http-error.js";
import { queueAppointmentNotifications } from "./notification-service.js";

type CreateAppointmentInput = {
  tenantId: string;
  source: BookingSource;
  staffId: string;
  startAt: Date;
  enforceSingleActiveByPhone?: boolean;
  customerId?: string;
  customer?: {
    fullName: string;
    phone?: string;
    email?: string;
  };
  serviceIds: string[];
  currency?: string;
  notificationChannels?: NotificationChannel[];
};

type DbClient = PrismaClient | Prisma.TransactionClient;

async function findOrCreateCustomer(
  prisma: DbClient,
  tenantId: string,
  input: CreateAppointmentInput,
) {
  if (input.customerId) {
    const existing = await prisma.customer.findFirst({
      where: { id: input.customerId, tenantId },
    });
    if (!existing) {
      throw notFound(
        "Cliente no existe para este tenant",
        "CUSTOMER_NOT_FOUND",
      );
    }
    return existing;
  }

  if (!input.customer) {
    throw badRequest("Debes enviar customerId o customer");
  }

  if (input.customer.phone || input.customer.email) {
    const orConditions: Array<{ phone?: string; email?: string }> = [];
    if (input.customer.phone) {
      orConditions.push({ phone: input.customer.phone });
    }
    if (input.customer.email) {
      orConditions.push({ email: input.customer.email });
    }

    const existing = await prisma.customer.findFirst({
      where: {
        tenantId,
        OR: orConditions,
      },
    });

    if (existing) {
      return existing;
    }
  }

  return prisma.customer.create({
    data: {
      tenantId,
      fullName: input.customer.fullName,
      phone: input.customer.phone,
      email: input.customer.email,
    },
  });
}

async function assertNoOverlap(
  prisma: DbClient,
  tenantId: string,
  staffId: string,
  startAt: Date,
  endAt: Date,
  skipAppointmentId?: string,
) {
  const existing = await prisma.appointment.findFirst({
    where: {
      tenantId,
      staffId,
      status: { in: ["pending", "confirmed"] },
      id: skipAppointmentId ? { not: skipAppointmentId } : undefined,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });

  if (existing) {
    throw conflict(
      "El profesional ya tiene una cita en ese horario",
      "SCHEDULE_CONFLICT",
    );
  }
}

async function assertNoActiveByPhone(
  prisma: DbClient,
  tenantId: string,
  phone: string,
) {
  const existing = await prisma.appointment.findFirst({
    where: {
      tenantId,
      status: { in: ["pending", "confirmed"] },
      endAt: { gt: new Date() },
      customer: {
        phone,
      },
    },
    include: {
      staff: true,
    },
  });

  if (existing) {
    throw conflict(
      `Este telefono ya tiene una cita activa (${existing.staff.displayName}, ${existing.startAt.toISOString()})`,
      "ACTIVE_PHONE_APPOINTMENT",
    );
  }
}

export async function createAppointment(
  prisma: PrismaClient,
  input: CreateAppointmentInput,
) {
  if (!input.serviceIds.length) {
    throw badRequest("Debes seleccionar al menos un servicio");
  }

  const [staff, services] = await Promise.all([
    prisma.staff.findFirst({
      where: { id: input.staffId, tenantId: input.tenantId, active: true },
    }),
    prisma.service.findMany({
      where: {
        id: { in: input.serviceIds },
        tenantId: input.tenantId,
        active: true,
      },
    }),
  ]);

  if (!staff) {
    throw notFound("Profesional no existe o esta inactivo", "STAFF_NOT_FOUND");
  }

  if (services.length !== input.serviceIds.length) {
    throw badRequest("Uno o mas servicios no son validos");
  }

  const totalDuration = services.reduce(
    (sum: number, s) => sum + s.durationMinutes,
    0,
  );
  const totalPrice = services.reduce((sum: number, s) => sum + s.priceCents, 0);
  const endAt = new Date(input.startAt.getTime() + totalDuration * 60_000);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const customer = await findOrCreateCustomer(tx, input.tenantId, input);

    if (input.enforceSingleActiveByPhone && customer.phone) {
      await assertNoActiveByPhone(tx, input.tenantId, customer.phone);
    }

    await assertNoOverlap(
      tx,
      input.tenantId,
      input.staffId,
      input.startAt,
      endAt,
    );

    const appointment = await tx.appointment.create({
      data: {
        tenantId: input.tenantId,
        customerId: customer.id,
        staffId: input.staffId,
        status: input.source === "portal" ? "confirmed" : "pending",
        startAt: input.startAt,
        endAt,
        priceCents: totalPrice,
        currency: input.currency ?? "MXN",
        source: input.source,
        services: {
          create: services.map(
            (service: {
              id: string;
              durationMinutes: number;
              priceCents: number;
            }) => ({
              serviceId: service.id,
              durationMinutes: service.durationMinutes,
              priceCents: service.priceCents,
            }),
          ),
        },
      },
      include: {
        services: {
          include: {
            service: true,
          },
        },
        customer: true,
        staff: true,
      },
    });

    await queueAppointmentNotifications(
      tx,
      appointment,
      "appointment.created",
      {
        channels: input.notificationChannels,
      },
    );

    return appointment;
  });
}

export async function rescheduleAppointment(
  prisma: PrismaClient,
  tenantId: string,
  appointmentId: string,
  newStartAt: Date,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: { services: true },
  });

  if (!appointment) {
    throw notFound("La cita no existe", "APPOINTMENT_NOT_FOUND");
  }

  if (
    appointment.status === "cancelled" ||
    appointment.status === "completed"
  ) {
    throw badRequest("No puedes reagendar una cita finalizada");
  }

  const duration = appointment.services.reduce(
    (sum: number, item) => sum + item.durationMinutes,
    0,
  );
  const newEndAt = new Date(newStartAt.getTime() + duration * 60_000);

  await assertNoOverlap(
    prisma,
    tenantId,
    appointment.staffId,
    newStartAt,
    newEndAt,
    appointment.id,
  );

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      startAt: newStartAt,
      endAt: newEndAt,
      status: "confirmed",
    },
    include: {
      customer: true,
      staff: true,
      services: { include: { service: true } },
    },
  });
  await queueAppointmentNotifications(
    prisma,
    updated,
    "appointment.confirmed",
    {
      idempotencySuffix: newStartAt.toISOString(),
    },
  );
  return updated;
}

export async function cancelAppointmentByCustomer(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    appointmentId: string;
    customerId?: string;
    notificationChannels?: NotificationChannel[];
    idempotencySuffix?: string;
  },
) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: input.appointmentId,
      tenantId: input.tenantId,
      customerId: input.customerId,
    },
    include: {
      customer: true,
      staff: true,
      services: { include: { service: true } },
      tenant: { include: { settings: true } },
    },
  });
  if (!appointment) {
    throw notFound("Cita no encontrada", "APPOINTMENT_NOT_FOUND");
  }
  if (!["pending", "confirmed"].includes(appointment.status)) {
    throw badRequest(
      "Solo puedes cancelar citas activas",
      "APPOINTMENT_NOT_ACTIVE",
    );
  }

  const policyMinutes = appointment.tenant.settings?.cancelPolicyMinutes ?? 0;
  const minutesUntilStart =
    (appointment.startAt.getTime() - Date.now()) / 60_000;
  if (minutesUntilStart < policyMinutes) {
    throw badRequest(
      `Esta cita requiere al menos ${policyMinutes} minutos de anticipación para cancelarse en línea`,
      "CANCELLATION_WINDOW_CLOSED",
    );
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "cancelled" },
    include: {
      customer: true,
      staff: true,
      services: { include: { service: true } },
    },
  });
  await queueAppointmentNotifications(
    prisma,
    updated,
    "appointment.cancelled_by_customer",
    {
      channels: input.notificationChannels,
      idempotencySuffix:
        input.idempotencySuffix ?? updated.updatedAt.toISOString(),
    },
  );
  return updated;
}
