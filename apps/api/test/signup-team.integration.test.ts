import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaClient } from "@citas/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

const prisma = createPrismaClient();
const DOMAIN = "qa-registro.local";
const ownerEmail = `duena@${DOMAIN}`;
const inviteeEmail = `recepcion@${DOMAIN}`;
const password = "Clinica2030";

let app: FastifyInstance;
let ownerToken: string;
let tenantId: string;
let tenantSlug: string;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
    include: { tenantUsers: true },
  });
  const tenantIds = users.flatMap((user) =>
    user.tenantUsers.map((membership) => membership.tenantId),
  );
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${DOMAIN}` } },
  });
}

/** Extrae el token del ultimo enlace enviado por correo a una direccion. */
async function tokenFromLastEmail(to: string, eventType: string) {
  const email = await prisma.notificationOutbox.findFirstOrThrow({
    where: { to, eventType },
    orderBy: { createdAt: "desc" },
  });
  const body = String((email.payloadJson as { body?: string }).body);
  const link = body.match(/https?:\/\/\S+/)?.[0];
  assert.ok(link, `el correo ${eventType} debe incluir un enlace`);
  return new URL(link).searchParams.get("token")!;
}

function authed(
  method: "GET" | "POST" | "PATCH",
  url: string,
  token: string,
  payload?: object,
) {
  return app.inject({
    method,
    url,
    payload,
    headers: { authorization: `Bearer ${token}` },
  });
}

test.before(async () => {
  await cleanup();
  app = await buildApp();
});

test.after(async () => {
  await app.close();
  await cleanup();
  await prisma.$disconnect();
});

test("el registro crea un negocio listo para operar con prueba gratuita", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/signup",
    payload: {
      businessName: "Clínica Dental Sonrisa",
      industry: "dental",
      ownerName: "Dra. Ana Pérez",
      email: ownerEmail.toUpperCase(),
      password,
      acceptTerms: true,
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  const body = response.json();
  ownerToken = body.token;
  tenantId = body.tenant.id;
  tenantSlug = body.tenant.slug;

  assert.equal(tenantSlug, "clinica-dental-sonrisa");
  assert.ok(body.bookingUrl.endsWith(`/${tenantSlug}`));
  assert.ok(body.user.permissions.includes("settings.manage"));

  const me = (await authed("GET", "/tenants/me", ownerToken)).json();
  assert.equal(me.industry.vocabulary.customer[0], "Paciente");
  assert.equal(me.subscription.state, "trialing");
  assert.equal(me.subscription.planCode, "negocio");
  assert.equal(me.access, "full");

  const services = (await authed("GET", "/services", ownerToken)).json();
  assert.deepEqual(
    services.map((service: { name: string }) => service.name).sort(),
    ["Evaluación", "Limpieza dental"],
  );
  assert.ok(
    (await prisma.notificationTemplate.count({ where: { tenantId } })) > 0,
    "el negocio nace con plantillas de notificacion",
  );
  assert.ok(
    await prisma.auditLog.findFirst({
      where: { tenantId, action: "tenant.signup" },
    }),
  );
});

test("el registro exige terminos, valida contrasena y no repite correos ni direcciones", async () => {
  const base = {
    businessName: "Otro negocio",
    industry: "barbershop",
    ownerName: "Persona QA",
    password,
    acceptTerms: true,
  };
  const noTerms = await app.inject({
    method: "POST",
    url: "/signup",
    payload: { ...base, email: `otro@${DOMAIN}`, acceptTerms: false },
  });
  assert.equal(noTerms.statusCode, 400);

  const weak = await app.inject({
    method: "POST",
    url: "/signup",
    payload: { ...base, email: `debil@${DOMAIN}`, password: "corta" },
  });
  assert.equal(weak.statusCode, 400);

  const duplicateEmail = await app.inject({
    method: "POST",
    url: "/signup",
    payload: { ...base, email: ownerEmail },
  });
  assert.equal(duplicateEmail.json().error, "EMAIL_IN_USE");

  const takenSlug = await app.inject({
    method: "POST",
    url: "/signup",
    payload: { ...base, email: `slug@${DOMAIN}`, slug: tenantSlug },
  });
  assert.equal(takenSlug.json().error, "SLUG_TAKEN");
});

test("el correo se verifica con el enlace recibido", async () => {
  const onboardingBefore = (
    await authed("GET", "/onboarding", ownerToken)
  ).json();
  assert.equal(
    onboardingBefore.steps.find(
      (step: { key: string }) => step.key === "verify_email",
    ).done,
    false,
  );

  const token = await tokenFromLastEmail(
    ownerEmail,
    "account.email_verification",
  );
  const verify = await app.inject({
    method: "POST",
    url: "/auth/email/verify",
    payload: { token },
  });
  assert.equal(verify.statusCode, 200);
  const reused = await app.inject({
    method: "POST",
    url: "/auth/email/verify",
    payload: { token },
  });
  assert.equal(
    reused.json().error,
    "TOKEN_INVALID",
    "el enlace es de un solo uso",
  );
});

test("una invitacion crea la cuenta del miembro con su rol", async () => {
  const invite = await authed("POST", "/team/invitations", ownerToken, {
    email: inviteeEmail,
    role: "receptionist",
  });
  assert.equal(invite.statusCode, 201, invite.body);

  const token = await tokenFromLastEmail(inviteeEmail, "team.invitation");
  const lookup = await app.inject({
    method: "GET",
    url: `/team/invitations/lookup?token=${token}`,
  });
  assert.equal(lookup.json().hasAccount, false);
  assert.equal(lookup.json().roleLabel, "Recepción");

  const accepted = await app.inject({
    method: "POST",
    url: "/team/invitations/accept",
    payload: { token, fullName: "Recepcionista QA", password: "Recepcion2030" },
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  const memberToken = accepted.json().token;
  assert.deepEqual(accepted.json().user.roles, ["receptionist"]);
  assert.equal(
    (await authed("GET", "/team", memberToken)).statusCode,
    403,
    "recepcion no administra el equipo",
  );

  const team = (await authed("GET", "/team", ownerToken)).json();
  assert.equal(team.members.length, 2);
});

test("el negocio nunca se queda sin dueno y nadie se edita a si mismo", async () => {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: ownerEmail },
  });
  const self = await authed("PATCH", `/team/members/${owner.id}`, ownerToken, {
    role: "staff",
  });
  assert.equal(self.json().error, "CANNOT_EDIT_SELF");

  const member = await prisma.user.findUniqueOrThrow({
    where: { email: inviteeEmail },
  });
  const promoted = await authed(
    "PATCH",
    `/team/members/${member.id}`,
    ownerToken,
    {
      role: "owner",
    },
  );
  assert.equal(promoted.statusCode, 200);
  const deactivated = await authed(
    "PATCH",
    `/team/members/${member.id}`,
    ownerToken,
    {
      active: false,
    },
  );
  assert.equal(deactivated.statusCode, 200, "quedan otros duenos activos");
});

test("restablecer la contrasena cierra las sesiones abiertas", async () => {
  const forgot = await app.inject({
    method: "POST",
    url: "/auth/password/forgot",
    payload: { email: ownerEmail },
  });
  assert.equal(forgot.statusCode, 200);
  const unknown = await app.inject({
    method: "POST",
    url: "/auth/password/forgot",
    payload: { email: `nadie@${DOMAIN}` },
  });
  assert.deepEqual(
    unknown.json(),
    forgot.json(),
    "no revela si el correo existe",
  );

  // El token anterior y el cambio de contrasena deben quedar en segundos distintos.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const token = await tokenFromLastEmail(ownerEmail, "account.password_reset");
  const reset = await app.inject({
    method: "POST",
    url: "/auth/password/reset",
    payload: { token, password: "NuevaClave2031" },
  });
  assert.equal(reset.statusCode, 200, reset.body);

  const oldSession = await authed("GET", "/tenants/me", ownerToken);
  assert.equal(oldSession.statusCode, 401);
  assert.equal(oldSession.json().error, "SESSION_REVOKED");

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: ownerEmail, password: "NuevaClave2031", tenantSlug },
  });
  assert.equal(login.statusCode, 200);
});
