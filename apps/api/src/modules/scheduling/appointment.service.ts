import type {
  AppointmentStatus,
  BookingSource,
  NotificationChannel,
} from "@citas/db";
import {
  APPOINTMENT_EVENTS,
  type AppointmentEvent,
} from "@citas/shared/notifications";
import { badRequest, conflict, notFound } from "../../shared/errors.js";
import {
  notFoundIfMissing,
  retryOnTransactionConflict,
} from "../../shared/prisma-errors.js";
import type { TenantScope, TenantTxScope } from "../../shared/tenant-scope.js";
import {
  enabledNotificationChannels,
  queueAppointmentNotifications,
} from "../notifications/notification.service.js";
import type { TenantContext } from "../tenancy/tenant-context.js";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  assertBookableSlot,
  resolveServices,
} from "./availability.service.js";

/**
 * Quien reserva determina las reglas: el personal del negocio puede agendar a cualquier hora
 * (sobrecupos, citas fuera de jornada); un cliente solo en espacios libres de la jornada.
 */
export type BookingActor = "staff" | "customer";

const appointmentDetails = {
  customer: true,
  staff: true,
  services: { include: { service: true } },
} as const;

type CustomerInput = { fullName: string; phone?: string; email?: string };

export type CreateAppointmentInput = {
  source: BookingSource;
  actor: BookingActor;
  staffId: string;
  serviceIds: string[];
  startAt: Date;
  customerId?: string;
  customer?: CustomerInput;
  /** Un telefono solo puede tener una cita activa (reservas de clientes). */
  enforceSingleActiveByPhone?: boolean;
  /** Canales para la notificacion de creacion; [] para no notificar. */
  notificationChannels?: NotificationChannel[];
};

async function findOrCreateCustomer(
  { db, tenantId }: TenantTxScope,
  input: Pick<CreateAppointmentInput, "customerId" | "customer">,
) {
  if (input.customerId) {
    return db.customer
      .findUniqueOrThrow({ where: { id: input.customerId } })
      .catch(notFoundIfMissing("Cliente no encontrado", "CUSTOMER_NOT_FOUND"));
  }
  if (!input.customer) {
    throw badRequest("Debes enviar customerId o los datos del cliente");
  }

  const { phone, email } = input.customer;
  const matches = [
    ...(phone ? [{ phone }] : []),
    ...(email ? [{ email }] : []),
  ];
  const existing = matches.length
    ? await db.customer.findFirst({ where: { OR: matches } })
    : null;
  return (
    existing ?? db.customer.create({ data: { tenantId, ...input.customer } })
  );
}

async function assertNoOverlap(
  { db }: TenantTxScope,
  input: { staffId: string; startAt: Date; endAt: Date; excludeId?: string },
) {
  const existing = await db.appointment.findFirst({
    where: {
      staffId: input.staffId,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      id: input.excludeId ? { not: input.excludeId } : undefined,
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
    },
    select: { id: true },
  });
  if (existing) {
    throw conflict(
      "El profesional ya tiene una cita en ese horario",
      "SCHEDULE_CONFLICT",
    );
  }
}

async function assertNoActiveAppointmentForPhone(
  { db }: TenantTxScope,
  phone: string,
) {
  const existing = await db.appointment.findFirst({
    where: {
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      endAt: { gt: new Date() },
      customer: { phone },
    },
    select: { id: true },
  });
  if (existing) {
    throw conflict(
      "Este telefono ya tiene una cita activa. Cancelala o reagendala antes de reservar otra.",
      "ACTIVE_PHONE_APPOINTMENT",
    );
  }
}

export function listAppointments(
  { db }: TenantScope,
  range: { from: Date; to: Date; staffId?: string },
) {
  return db.appointment.findMany({
    where: {
      staffId: range.staffId,
      startAt: { gte: range.from },
      endAt: { lte: range.to },
    },
    include: appointmentDetails,
    orderBy: { startAt: "asc" },
  });
}

export async function createAppointment(
  scope: TenantScope,
  tenant: TenantContext,
  input: CreateAppointmentInput,
) {
  // Dos reservas del mismo horario pueden chocar en la restriccion de exclusion; al
  // reintentar, la que perdio ve la cita ya confirmada y recibe SCHEDULE_CONFLICT.
  return retryOnTransactionConflict(() =>
    scope.db.$transaction(async (db) => {
      const tx = { tenantId: scope.tenantId, db };
      const staff = await db.staff.findFirst({
        where: { id: input.staffId, active: true },
        select: { id: true },
      });
      if (!staff) {
        throw notFound(
          "Profesional no existe o esta inactivo",
          "STAFF_NOT_FOUND",
        );
      }
      const { services, durationMinutes, priceCents } = await resolveServices(
        tx,
        input.serviceIds,
      );
      if (input.actor === "customer") {
        await assertBookableSlot(tx, tenant, input);
      }

      const customer = await findOrCreateCustomer(tx, input);
      if (input.enforceSingleActiveByPhone && customer.phone) {
        await assertNoActiveAppointmentForPhone(tx, customer.phone);
      }
      const endAt = new Date(
        input.startAt.getTime() + durationMinutes * 60_000,
      );
      await assertNoOverlap(tx, {
        staffId: input.staffId,
        startAt: input.startAt,
        endAt,
      });

      const appointment = await db.appointment.create({
        data: {
          tenantId: scope.tenantId,
          customerId: customer.id,
          staffId: input.staffId,
          status: input.source === "portal" ? "confirmed" : "pending",
          startAt: input.startAt,
          endAt,
          priceCents,
          currency: tenant.currency,
          source: input.source,
          services: {
            create: services.map((service) => ({
              serviceId: service.id,
              durationMinutes: service.durationMinutes,
              priceCents: service.priceCents,
            })),
          },
        },
        include: appointmentDetails,
      });

      await queueAppointmentNotifications(
        tx,
        tenant,
        appointment,
        APPOINTMENT_EVENTS.created,
        { channels: input.notificationChannels },
      );
      return appointment;
    }),
  );
}

async function findAppointment({ db }: TenantTxScope, appointmentId: string) {
  return db.appointment
    .findUniqueOrThrow({
      where: { id: appointmentId },
      include: appointmentDetails,
    })
    .catch(notFoundIfMissing("Cita no encontrada", "APPOINTMENT_NOT_FOUND"));
}

export async function rescheduleAppointment(
  scope: TenantScope,
  tenant: TenantContext,
  appointmentId: string,
  newStartAt: Date,
  options: {
    actor: BookingActor;
    notificationChannels?: NotificationChannel[];
  },
) {
  return retryOnTransactionConflict(() =>
    scope.db.$transaction(async (db) => {
      const tx = { tenantId: scope.tenantId, db };
      const appointment = await findAppointment(tx, appointmentId);
      if (
        appointment.status === "cancelled" ||
        appointment.status === "completed"
      ) {
        throw badRequest(
          "No puedes reagendar una cita finalizada o cancelada",
          "APPOINTMENT_NOT_ACTIVE",
        );
      }
      if (options.actor === "customer") {
        await assertBookableSlot(tx, tenant, {
          staffId: appointment.staffId,
          serviceIds: appointment.services.map((item) => item.serviceId),
          startAt: newStartAt,
          excludeAppointmentId: appointment.id,
        });
      }

      const duration = appointment.services.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      );
      const newEndAt = new Date(newStartAt.getTime() + duration * 60_000);
      await assertNoOverlap(tx, {
        staffId: appointment.staffId,
        startAt: newStartAt,
        endAt: newEndAt,
        excludeId: appointment.id,
      });

      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: { startAt: newStartAt, endAt: newEndAt, status: "confirmed" },
        include: appointmentDetails,
      });
      await queueAppointmentNotifications(
        tx,
        tenant,
        updated,
        APPOINTMENT_EVENTS.confirmed,
        {
          channels: options.notificationChannels,
          idempotencySuffix: newStartAt.toISOString(),
        },
      );
      return updated;
    }),
  );
}

export async function cancelAppointmentByCustomer(
  scope: TenantScope,
  tenant: TenantContext,
  input: {
    appointmentId: string;
    customerId?: string;
    notificationChannels?: NotificationChannel[];
    idempotencySuffix?: string;
  },
) {
  const appointment = await scope.db.appointment.findFirst({
    where: { id: input.appointmentId, customerId: input.customerId },
  });
  if (!appointment) {
    throw notFound("Cita no encontrada", "APPOINTMENT_NOT_FOUND");
  }
  if (
    !(ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(
      appointment.status,
    )
  ) {
    throw badRequest(
      "Solo puedes cancelar citas activas",
      "APPOINTMENT_NOT_ACTIVE",
    );
  }
  const minutesUntilStart =
    (appointment.startAt.getTime() - Date.now()) / 60_000;
  if (minutesUntilStart < tenant.cancelPolicyMinutes) {
    throw badRequest(
      `Esta cita requiere al menos ${tenant.cancelPolicyMinutes} minutos de anticipación para cancelarse en línea`,
      "CANCELLATION_WINDOW_CLOSED",
    );
  }

  return scope.db.$transaction(async (db) => {
    const updated = await db.appointment.update({
      where: { id: appointment.id },
      data: { status: "cancelled" },
      include: appointmentDetails,
    });
    await queueAppointmentNotifications(
      { tenantId: scope.tenantId, db },
      tenant,
      updated,
      APPOINTMENT_EVENTS.cancelledByCustomer,
      {
        channels: input.notificationChannels,
        idempotencySuffix:
          input.idempotencySuffix ?? updated.updatedAt.toISOString(),
      },
    );
    return updated;
  });
}

const STATUS_EVENTS: Partial<Record<AppointmentStatus, AppointmentEvent>> = {
  confirmed: APPOINTMENT_EVENTS.confirmed,
  cancelled: APPOINTMENT_EVENTS.cancelled,
};

export async function updateAppointmentStatus(
  scope: TenantScope,
  tenant: TenantContext,
  appointmentId: string,
  status: AppointmentStatus,
  options: {
    notify?: boolean;
    notificationChannels?: NotificationChannel[];
    idempotencySuffix?: string;
  } = {},
) {
  return scope.db.$transaction(async (db) => {
    const updated = await db.appointment
      .update({
        where: { id: appointmentId },
        data: { status },
        include: appointmentDetails,
      })
      .catch(notFoundIfMissing("Cita no encontrada", "APPOINTMENT_NOT_FOUND"));
    const event = STATUS_EVENTS[status];
    if (event && options.notify !== false) {
      await queueAppointmentNotifications(
        { tenantId: scope.tenantId, db },
        tenant,
        updated,
        event,
        {
          channels: options.notificationChannels,
          idempotencySuffix:
            options.idempotencySuffix ?? updated.updatedAt.toISOString(),
        },
      );
    }
    return updated;
  });
}

const HISTORICAL_STATUSES: AppointmentStatus[] = ["completed", "no_show"];

export async function deleteAppointment(
  { db }: TenantScope,
  appointmentId: string,
) {
  const appointment = await db.appointment
    .findUniqueOrThrow({ where: { id: appointmentId } })
    .catch(notFoundIfMissing("Cita no encontrada", "APPOINTMENT_NOT_FOUND"));
  if (HISTORICAL_STATUSES.includes(appointment.status)) {
    throw badRequest(
      "No puedes eliminar citas historicas (completadas o no asistidas)",
      "APPOINTMENT_IS_HISTORICAL",
    );
  }
  await db.appointment.delete({ where: { id: appointment.id } });
  return { ok: true as const, deletedId: appointment.id };
}

/** Encola una notificacion de prueba de una cita por los canales disponibles. */
export async function queueTestNotification(
  scope: TenantScope,
  tenant: TenantContext,
  appointmentId: string,
  requestedChannels?: NotificationChannel[],
) {
  const appointment = await findAppointment(scope, appointmentId);
  const available = await enabledNotificationChannels(
    scope,
    appointment.customer,
  );
  const channels = (requestedChannels ?? available).filter((channel) =>
    available.includes(channel),
  );
  if (!channels.length) {
    throw badRequest(
      "No hay canales disponibles para esta cita. Revisa el plan y los datos de contacto del cliente.",
      "NO_CHANNEL_AVAILABLE",
    );
  }
  const rows = await queueAppointmentNotifications(
    scope,
    tenant,
    appointment,
    APPOINTMENT_EVENTS.manualTest,
    { channels, idempotencySuffix: new Date().toISOString() },
  );
  return {
    ok: true as const,
    appointmentId: appointment.id,
    channels: rows.map((row) => row.channel),
    outboxIds: rows.map((row) => row.id),
  };
}
