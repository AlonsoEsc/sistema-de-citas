/**
 * Datos de desarrollo: un negocio demo (barberia) con los tres roles, personal, horarios,
 * servicios y plantillas. Es idempotente: se puede correr varias veces.
 */
import {
  DEFAULT_ROLES,
  PERMISSION_DESCRIPTIONS,
  type PermissionKey,
} from "@citas/shared/access";
import { industryProfile } from "@citas/shared/industries";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "@citas/shared/notifications";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../src/index";

config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  quiet: true,
});
const prisma = createPrismaClient();

const DEMO_USERS = [
  { email: "admin@demo.com", password: "Admin1234!", role: "owner" },
  { email: "staff@demo.com", password: "Staff1234!", role: "staff" },
  {
    email: "recepcion@demo.com",
    password: "Recepcion1234!",
    role: "receptionist",
  },
];

const DAY_MS = 86_400_000;

async function seedPermissionsAndRoles(tenantId: string) {
  const permissions = new Map<PermissionKey, string>();
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    const permission = await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
    permissions.set(key as PermissionKey, permission.id);
  }

  const roles = new Map<string, string>();
  for (const [name, keys] of Object.entries(DEFAULT_ROLES)) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: { tenantId, name },
      update: {},
    });
    roles.set(name, role.id);
    for (const key of keys) {
      const permissionId = permissions.get(key)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }
  return roles;
}

async function main() {
  const tenantId =
    process.env.DEFAULT_TENANT_ID ?? "11111111-1111-1111-1111-111111111111";
  const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "demo-barberia";
  const industry = industryProfile("barbershop");

  const tenantData = {
    name: "Demo Barber Studio",
    slug: tenantSlug,
    industry: industry.code,
    timezone: "America/El_Salvador",
    currency: "USD",
    locale: "es-SV",
  };
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      ...tenantData,
      settings: { create: { cancelPolicyMinutes: 120, bookingWindowDays: 45 } },
    },
    update: tenantData,
  });

  // El demo usa el plan mas completo para mostrar todas las funciones.
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { code: "clinica" },
  });
  const periodEnd = new Date(Date.now() + 30 * DAY_MS);
  await prisma.subscription.upsert({
    where: { tenantId },
    create: {
      tenantId,
      planId: plan.id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
    update: { planId: plan.id, status: "active", currentPeriodEnd: periodEnd },
  });

  const roles = await seedPermissionsAndRoles(tenantId);
  for (const demoUser of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(demoUser.password, 10);
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      create: {
        email: demoUser.email,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
      update: { passwordHash, isActive: true },
    });
    await prisma.tenantUser.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: { tenantId, userId: user.id, status: "active" },
      update: { status: "active" },
    });
    const roleId = roles.get(demoUser.role)!;
    await prisma.userRole.upsert({
      where: { tenantId_userId_roleId: { tenantId, userId: user.id, roleId } },
      create: { tenantId, userId: user.id, roleId },
      update: {},
    });
  }

  // Entitlements como excepciones del negocio: el plan ya define los canales.
  await prisma.tenantEntitlement.deleteMany({
    where: {
      tenantId,
      key: { in: ["staff.limit", "reports.advanced.enabled"] },
    },
  });

  if ((await prisma.staff.count({ where: { tenantId } })) === 0) {
    for (const displayName of ["Carlos Rivera", "Andrea Flores"]) {
      await prisma.staff.create({ data: { tenantId, displayName } });
    }
  }
  const staffMembers = await prisma.staff.findMany({ where: { tenantId } });
  for (const staff of staffMembers) {
    if (
      (await prisma.staffSchedule.count({ where: { staffId: staff.id } })) > 0
    ) {
      continue;
    }
    await prisma.staffSchedule.createMany({
      data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        tenantId,
        staffId: staff.id,
        dayOfWeek,
        startTime: "09:00",
        endTime: "19:00",
        breakJson: [{ start: "14:00", end: "15:00" }],
      })),
    });
  }

  for (const service of industry.suggestedServices) {
    const existing = await prisma.service.findFirst({
      where: { tenantId, name: service.name },
    });
    if (!existing) {
      await prisma.service.create({ data: { tenantId, ...service } });
    }
  }

  for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
    const key = {
      tenantId,
      channel: template.channel,
      eventType: template.eventType,
    };
    await prisma.notificationTemplate.upsert({
      where: { tenantId_channel_eventType: key },
      create: {
        ...key,
        subject: template.subject,
        body: template.body,
        variablesJson: template.providerTemplate,
      },
      update: {
        subject: template.subject,
        body: template.body,
        variablesJson: template.providerTemplate,
      },
    });
  }

  console.log(
    `Seed listo: negocio "${tenantSlug}" (plan ${plan.code}) con ${DEMO_USERS.length} usuarios demo.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
