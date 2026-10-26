import type { Industry, Prisma, PrismaClient } from "@citas/db";
import {
  DEFAULT_ROLES,
  OWNER_ROLE,
  PERMISSION_DESCRIPTIONS,
} from "@citas/shared/access";
import { industryProfile } from "@citas/shared/industries";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "@citas/shared/notifications";
import bcrypt from "bcryptjs";
import { conflict } from "../../shared/errors.js";
import { RESERVED_SLUGS, slugify } from "../../shared/slug.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  TRIAL_PLAN_CODE,
  trialEndDate,
} from "../billing/subscription-status.js";

export type ProvisionTenantInput = {
  businessName: string;
  slug?: string;
  industry: Industry;
  timezone: string;
  currency: string;
  locale?: string;
  owner: { fullName: string; email: string; password: string };
  ip?: string;
};

type Tx = Prisma.TransactionClient;

/** Primer slug libre a partir del pedido o del nombre del negocio ("barberia-x-2"...). */
async function availableSlug(tx: Tx, input: ProvisionTenantInput) {
  if (input.slug) {
    const taken =
      RESERVED_SLUGS.has(input.slug) ||
      (await tx.tenant.findUnique({ where: { slug: input.slug } }));
    if (taken) {
      throw conflict("Esa direccion de reservas ya esta en uso", "SLUG_TAKEN");
    }
    return input.slug;
  }
  const base = slugify(input.businessName) || "negocio";
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (
      !RESERVED_SLUGS.has(candidate) &&
      !(await tx.tenant.findUnique({ where: { slug: candidate } }))
    ) {
      return candidate;
    }
  }
  throw conflict("No se pudo generar una direccion de reservas", "SLUG_TAKEN");
}

async function createDefaultRoles(tx: Tx, tenantId: string) {
  // El catalogo de permisos es global; se asegura por si la base es nueva.
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await tx.permission.upsert({
      where: { key },
      create: { key, description },
      update: {},
    });
  }
  const roleIds = new Map<string, string>();
  for (const [name, permissionKeys] of Object.entries(DEFAULT_ROLES)) {
    const permissions = await tx.permission.findMany({
      where: { key: { in: permissionKeys } },
    });
    const role = await tx.role.create({
      data: {
        tenantId,
        name,
        permissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
    });
    roleIds.set(name, role.id);
  }
  return roleIds;
}

/**
 * Da de alta un negocio listo para operar: dueno con rol owner, roles por defecto, prueba
 * gratuita, servicios sugeridos para su rubro y plantillas de notificacion.
 */
export async function provisionTenant(
  prisma: PrismaClient,
  input: ProvisionTenantInput,
) {
  const email = input.owner.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.owner.password, 10);
  const profile = industryProfile(input.industry);

  return prisma.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email } })) {
      throw conflict(
        "Ya existe una cuenta con ese correo. Inicia sesion o recupera tu contrasena.",
        "EMAIL_IN_USE",
      );
    }
    const plan = await tx.plan.findUniqueOrThrow({
      where: { code: TRIAL_PLAN_CODE },
    });

    const tenant = await tx.tenant.create({
      data: {
        name: input.businessName,
        slug: await availableSlug(tx, input),
        industry: input.industry,
        timezone: input.timezone,
        currency: input.currency,
        locale: input.locale ?? "es-SV",
        settings: { create: {} },
        subscription: {
          create: {
            planId: plan.id,
            status: "trialing",
            trialEndsAt: trialEndDate(),
          },
        },
        services: { create: profile.suggestedServices },
        notificationTpls: {
          create: DEFAULT_NOTIFICATION_TEMPLATES.map((template) => ({
            channel: template.channel,
            eventType: template.eventType,
            subject: template.subject,
            body: template.body,
          })),
        },
      },
    });

    const roleIds = await createDefaultRoles(tx, tenant.id);
    const user = await tx.user.create({
      data: { email, fullName: input.owner.fullName, passwordHash },
    });
    await tx.tenantUser.create({
      data: { tenantId: tenant.id, userId: user.id },
    });
    await tx.userRole.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        roleId: roleIds.get(OWNER_ROLE)!,
      },
    });
    await recordAudit(tx, {
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "tenant.signup",
      entityType: "Tenant",
      entityId: tenant.id,
      metadata: { industry: tenant.industry, plan: plan.code },
      ip: input.ip,
    });

    return { tenant, user };
  });
}
