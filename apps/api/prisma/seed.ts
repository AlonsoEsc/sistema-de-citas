import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const tenantId =
    process.env.DEFAULT_TENANT_ID ?? "11111111-1111-1111-1111-111111111111";
  const tenantSlug = process.env.DEFAULT_TENANT_SLUG ?? "demo-barberia";

  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: "Demo Barber Studio",
      slug: tenantSlug,
      timezone: "America/Mexico_City",
      currency: "MXN",
      settings: {
        create: {
          cancelPolicyMinutes: 120,
          bookingWindowDays: 45,
          brandingJson: {
            primary: "#0F766E",
            accent: "#EA580C",
            logoText: "Demo Barber Studio",
          },
        },
      },
    },
    update: {},
  });

  const [ownerRole, staffRole, receptionistRole] = await Promise.all([
    prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: "owner" } },
      create: { tenantId, name: "owner" },
      update: {},
    }),
    prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: "staff" } },
      create: { tenantId, name: "staff" },
      update: {},
    }),
    prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: "receptionist" } },
      create: { tenantId, name: "receptionist" },
      update: {},
    }),
  ]);

  const permissions = [
    { key: "appointments.manage", description: "Crear y modificar citas" },
    { key: "staff.manage", description: "Gestionar personal" },
    { key: "services.manage", description: "Gestionar servicios" },
    { key: "customers.manage", description: "Gestionar clientes" },
    { key: "reports.view", description: "Ver reportes" },
    {
      key: "settings.manage",
      description: "Gestionar ajustes, integraciones, plantillas y plan",
    },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      create: perm,
      update: {},
    });
  }

  const ownerPerms = await prisma.permission.findMany({
    where: { key: { in: permissions.map((p) => p.key) } },
  });

  for (const perm of ownerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: ownerRole.id, permissionId: perm.id },
      },
      create: { roleId: ownerRole.id, permissionId: perm.id },
      update: {},
    });
  }

  const staffPerms = ownerPerms.filter((p) => p.key === "appointments.manage");
  for (const perm of staffPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: staffRole.id, permissionId: perm.id },
      },
      create: { roleId: staffRole.id, permissionId: perm.id },
      update: {},
    });
  }

  const receptionistPerms = ownerPerms.filter(
    (p) => p.key === "appointments.manage" || p.key === "customers.manage",
  );
  for (const perm of receptionistPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: receptionistRole.id,
          permissionId: perm.id,
        },
      },
      create: { roleId: receptionistRole.id, permissionId: perm.id },
      update: {},
    });
  }

  const usersToEnsure = [
    { email: "admin@demo.com", password: "Admin1234!", roleId: ownerRole.id },
    { email: "staff@demo.com", password: "Staff1234!", roleId: staffRole.id },
    {
      email: "recepcion@demo.com",
      password: "Recepcion1234!",
      roleId: receptionistRole.id,
    },
  ];

  for (const demoUser of usersToEnsure) {
    const passwordHash = await bcrypt.hash(demoUser.password, 10);
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      create: {
        email: demoUser.email,
        passwordHash,
      },
      update: {
        passwordHash,
        isActive: true,
      },
    });

    await prisma.tenantUser.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: { tenantId, userId: user.id, status: "active" },
      update: { status: "active" },
    });

    await prisma.userRole.upsert({
      where: {
        tenantId_userId_roleId: {
          tenantId,
          userId: user.id,
          roleId: demoUser.roleId,
        },
      },
      create: { tenantId, userId: user.id, roleId: demoUser.roleId },
      update: {},
    });
  }

  const basicPlan = await prisma.plan.upsert({
    where: { code: "basic" },
    create: {
      code: "basic",
      name: "Basic",
      billingPeriod: "monthly",
      priceCents: 29900,
    },
    update: {},
  });

  await prisma.tenantSubscription.upsert({
    where: { tenantId_planId: { tenantId, planId: basicPlan.id } },
    create: {
      tenantId,
      planId: basicPlan.id,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
    update: {
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });

  const entitlements = [
    { key: "notifications.whatsapp.enabled", valueJson: { enabled: true } },
    { key: "notifications.email.enabled", valueJson: { enabled: true } },
    { key: "staff.limit", valueJson: { n: 5 } },
    { key: "reports.advanced.enabled", valueJson: { enabled: true } },
  ];

  for (const entitlement of entitlements) {
    await prisma.tenantEntitlement.upsert({
      where: { tenantId_key: { tenantId, key: entitlement.key } },
      create: {
        tenantId,
        key: entitlement.key,
        valueJson: entitlement.valueJson,
      },
      update: { valueJson: entitlement.valueJson },
    });
  }

  const existingStaff = await prisma.staff.findMany({ where: { tenantId } });
  const staffMembers =
    existingStaff.length > 0
      ? existingStaff
      : await Promise.all([
          prisma.staff.create({
            data: {
              tenantId,
              displayName: "Carlos Rivera",
              phone: "+525511111111",
              commissionType: "percent",
              commissionValue: 35,
            },
          }),
          prisma.staff.create({
            data: {
              tenantId,
              displayName: "Andrea Flores",
              phone: "+525522222222",
              commissionType: "percent",
              commissionValue: 40,
            },
          }),
        ]);

  for (const staff of staffMembers) {
    const count = await prisma.staffSchedule.count({
      where: { tenantId, staffId: staff.id },
    });
    if (count > 0) {
      continue;
    }
    for (const day of [1, 2, 3, 4, 5, 6]) {
      await prisma.staffSchedule.create({
        data: {
          tenantId,
          staffId: staff.id,
          dayOfWeek: day,
          startTime: "09:00",
          endTime: "19:00",
          breakJson: [{ start: "14:00", end: "15:00" }],
        },
      });
    }
  }

  const existingServices = await prisma.service.count({ where: { tenantId } });
  if (existingServices === 0) {
    await Promise.all([
      prisma.service.create({
        data: {
          tenantId,
          name: "Corte clasico",
          durationMinutes: 45,
          priceCents: 25000,
        },
      }),
      prisma.service.create({
        data: {
          tenantId,
          name: "Corte + barba premium",
          durationMinutes: 75,
          priceCents: 42000,
        },
      }),
      prisma.service.create({
        data: {
          tenantId,
          name: "Limpieza facial",
          durationMinutes: 30,
          priceCents: 18000,
        },
      }),
    ]);
  }

  await prisma.notificationTemplate.upsert({
    where: {
      tenantId_channel_eventType: {
        tenantId,
        channel: "email",
        eventType: "appointment.reminder_24h",
      },
    },
    create: {
      tenantId,
      channel: "email",
      eventType: "appointment.reminder_24h",
      subject: "Recordatorio de cita",
      body: "Hola {{customerName}}, te esperamos manana a las {{startAt}}.",
    },
    update: {
      subject: "Recordatorio de cita",
      body: "Hola {{customerName}}, te esperamos manana a las {{startAt}}.",
    },
  });

  await prisma.notificationTemplate.upsert({
    where: {
      tenantId_channel_eventType: {
        tenantId,
        channel: "whatsapp",
        eventType: "appointment.created",
      },
    },
    create: {
      tenantId,
      channel: "whatsapp",
      eventType: "appointment.created",
      body: "Tu cita fue creada para {{startAt}} con {{staffName}}.",
    },
    update: {
      body: "Tu cita fue creada para {{startAt}} con {{staffName}}.",
    },
  });

  const whatsappTemplates = [
    {
      eventType: "appointment.reminder_24h",
      body: "Hola {{customerName}}, te recordamos tu cita con {{staffName}} para {{startAt}}. Responde CONFIRMAR, REAGENDAR o CANCELAR.",
    },
    {
      eventType: "appointment.reminder_2h",
      body: "Hola {{customerName}}, tu cita con {{staffName}} es en aproximadamente 2 horas.",
    },
    {
      eventType: "appointment.confirmed",
      body: "Tu cita con {{staffName}} para {{startAt}} quedó confirmada.",
    },
    {
      eventType: "appointment.cancelled",
      body: "Tu cita con {{staffName}} para {{startAt}} fue cancelada.",
    },
    {
      eventType: "appointment.followup",
      body: "Gracias por tu visita, {{customerName}}. ¿Cómo fue tu experiencia? Responde del 1 al 5.",
    },
    {
      eventType: "appointment.no_show_followup",
      body: "Hola {{customerName}}, notamos que no pudiste asistir. Responde AGENDAR para encontrar un nuevo horario o ASESOR si necesitas ayuda.",
    },
    {
      eventType: "auth.otp.requested",
      body: "Tu código de verificación es {{code}}. Vence en {{expiresInMinutes}} minutos.",
    },
  ];

  for (const template of whatsappTemplates) {
    await prisma.notificationTemplate.upsert({
      where: {
        tenantId_channel_eventType: {
          tenantId,
          channel: "whatsapp",
          eventType: template.eventType,
        },
      },
      create: {
        tenantId,
        channel: "whatsapp",
        eventType: template.eventType,
        body: template.body,
      },
      update: {
        body: template.body,
      },
    });
  }

  console.log("Seed listo: admin, staff y receptionist creados.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
