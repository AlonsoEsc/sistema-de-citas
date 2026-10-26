import type { Prisma, TenantTx } from "@citas/db";
import { env } from "../../config.js";

/** Enlaces del panel que reciben un token por correo. */
export function panelLink(path: string, token: string) {
  const url = new URL(path, env.ADMIN_BASE_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

type Email = { eventType: string; to: string; subject: string; body: string };

/** Correo transaccional de la plataforma; lo envia el worker desde el outbox. */
type OutboxWriter =
  | Pick<Prisma.TransactionClient, "notificationOutbox">
  | Pick<TenantTx, "notificationOutbox">;

export function queueEmail(db: OutboxWriter, tenantId: string, email: Email) {
  return db.notificationOutbox.create({
    data: {
      tenantId,
      channel: "email",
      eventType: email.eventType,
      to: email.to,
      payloadJson: { subject: email.subject, body: email.body },
    },
  });
}

export const accountEmails = {
  verifyEmail: (name: string, link: string): Omit<Email, "to"> => ({
    eventType: "account.email_verification",
    subject: `Confirma tu correo en ${env.PRODUCT_NAME}`,
    body: `Hola ${name}, confirma tu correo para proteger tu cuenta:\n\n${link}\n\nEl enlace vence en 48 horas.`,
  }),
  passwordReset: (link: string): Omit<Email, "to"> => ({
    eventType: "account.password_reset",
    subject: `Restablece tu contraseña de ${env.PRODUCT_NAME}`,
    body: `Recibimos una solicitud para restablecer tu contraseña:\n\n${link}\n\nEl enlace vence en 1 hora. Si no fuiste tú, ignora este correo.`,
  }),
  invitation: (
    businessName: string,
    roleLabel: string,
    link: string,
  ): Omit<Email, "to"> => ({
    eventType: "team.invitation",
    subject: `Te invitaron al equipo de ${businessName}`,
    body: `Te invitaron a ${businessName} en ${env.PRODUCT_NAME} con el rol ${roleLabel}.\n\nAcepta la invitación aquí:\n\n${link}\n\nEl enlace vence en 7 días.`,
  }),
};
