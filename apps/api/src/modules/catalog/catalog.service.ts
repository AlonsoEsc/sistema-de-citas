import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import type { TenantScope } from "../../shared/tenant-scope.js";
import type {
  ScheduleInput,
  ServiceInput,
  StaffInput,
} from "./catalog.schemas.js";

const scheduleOrder = [
  { dayOfWeek: "asc" as const },
  { startTime: "asc" as const },
];

export function listStaff({ db }: TenantScope) {
  return db.staff.findMany({ orderBy: { displayName: "asc" } });
}

export function createStaff({ db, tenantId }: TenantScope, input: StaffInput) {
  return db.staff.create({
    data: { tenantId, ...input, active: input.active ?? true },
  });
}

export function updateStaff(
  { db }: TenantScope,
  staffId: string,
  input: Partial<StaffInput>,
) {
  return db.staff
    .update({ where: { id: staffId }, data: input })
    .catch(notFoundIfMissing("Profesional no encontrado", "STAFF_NOT_FOUND"));
}

export function getStaffSchedule({ db }: TenantScope, staffId: string) {
  return db.staffSchedule.findMany({
    where: { staffId },
    orderBy: scheduleOrder,
  });
}

/** Reemplaza el horario semanal completo de un profesional en una sola transaccion. */
export async function replaceStaffSchedule(
  scope: TenantScope,
  staffId: string,
  segments: ScheduleInput,
) {
  const { db, tenantId } = scope;
  await db.staff
    .findUniqueOrThrow({ where: { id: staffId } })
    .catch(notFoundIfMissing("Profesional no encontrado", "STAFF_NOT_FOUND"));

  await db.$transaction(async (tx) => {
    await tx.staffSchedule.deleteMany({ where: { staffId } });
    await tx.staffSchedule.createMany({
      data: segments.map((segment) => ({ tenantId, staffId, ...segment })),
    });
  });
  return getStaffSchedule(scope, staffId);
}

export function listServices({ db }: TenantScope) {
  return db.service.findMany({ orderBy: { name: "asc" } });
}

export function createService(
  { db, tenantId }: TenantScope,
  input: ServiceInput,
) {
  return db.service.create({
    data: { tenantId, ...input, active: input.active ?? true },
  });
}

export function updateService(
  { db }: TenantScope,
  serviceId: string,
  input: Partial<ServiceInput>,
) {
  return db.service
    .update({ where: { id: serviceId }, data: input })
    .catch(notFoundIfMissing("Servicio no encontrado", "SERVICE_NOT_FOUND"));
}
