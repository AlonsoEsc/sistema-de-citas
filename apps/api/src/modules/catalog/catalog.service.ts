import { forbidden } from "../../shared/errors.js";
import { notFoundIfMissing } from "../../shared/prisma-errors.js";
import type { TenantScope } from "../../shared/tenant-scope.js";
import type { TenantContext } from "../tenancy/tenant-context.js";
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

/** El plan limita cuantos profesionales activos puede tener el negocio. */
async function assertStaffSlotAvailable(
  { db }: TenantScope,
  tenant: Pick<TenantContext, "limits">,
) {
  const active = await db.staff.count({ where: { active: true } });
  if (active >= tenant.limits.maxStaff) {
    throw forbidden(
      `Tu plan permite ${tenant.limits.maxStaff} profesionales activos. Cambia de plan para agregar mas.`,
      "PLAN_LIMIT_REACHED",
    );
  }
}

export async function createStaff(
  scope: TenantScope,
  tenant: Pick<TenantContext, "limits">,
  input: StaffInput,
) {
  const active = input.active ?? true;
  if (active) {
    await assertStaffSlotAvailable(scope, tenant);
  }
  return scope.db.staff.create({
    data: { tenantId: scope.tenantId, ...input, active },
  });
}

export async function updateStaff(
  scope: TenantScope,
  tenant: Pick<TenantContext, "limits">,
  staffId: string,
  input: Partial<StaffInput>,
) {
  const current = await scope.db.staff
    .findUniqueOrThrow({ where: { id: staffId } })
    .catch(notFoundIfMissing("Profesional no encontrado", "STAFF_NOT_FOUND"));
  if (input.active && !current.active) {
    await assertStaffSlotAvailable(scope, tenant);
  }
  return scope.db.staff.update({ where: { id: staffId }, data: input });
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
