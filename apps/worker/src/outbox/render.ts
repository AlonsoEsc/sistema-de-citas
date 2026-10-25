import type { NotificationOutbox, PrismaClient } from "@citas/db";
import type { ProviderTemplateConfig } from "@citas/shared/integrations";

export type NotificationPayload = {
  subject?: string;
  body?: string;
  message?: string;
  code?: string;
  appointmentId?: string;
  [key: string]: unknown;
};

export type RenderedMessage = {
  subject: string;
  body: string;
  providerTemplate?: ProviderTemplateConfig;
};

const DEFAULT_SUBJECT = "Notificación de cita";

export function payloadOf(item: Pick<NotificationOutbox, "payloadJson">) {
  const value = item.payloadJson;
  return (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as NotificationPayload;
}

/** Sustituye {{variable}} (o {{a.b}}) por valores del payload; listas se unen con comas. */
export function interpolate(template: string, payload: NotificationPayload) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((current, key) => {
      return current && typeof current === "object" && !Array.isArray(current)
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, payload);
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return value === undefined || value === null ? "" : String(value);
  });
}

/**
 * Texto final de una notificacion: plantilla del negocio si existe; si no, el mensaje que
 * la API dejo en el payload; como ultimo recurso, un texto generico.
 */
export async function renderMessage(
  prisma: PrismaClient,
  item: NotificationOutbox,
): Promise<RenderedMessage> {
  const payload = payloadOf(item);
  const template = await prisma.notificationTemplate.findUnique({
    where: {
      tenantId_channel_eventType: {
        tenantId: item.tenantId,
        channel: item.channel,
        eventType: item.eventType,
      },
    },
  });
  const variables = template?.variablesJson;
  const providerTemplate =
    variables && typeof variables === "object" && !Array.isArray(variables)
      ? (variables as ProviderTemplateConfig)
      : undefined;

  const body = template?.body ?? payload.message ?? payload.body;
  if (body) {
    return {
      body: interpolate(body, payload),
      subject: interpolate(
        template?.subject ?? payload.subject ?? DEFAULT_SUBJECT,
        payload,
      ),
      providerTemplate,
    };
  }
  if (payload.code) {
    return {
      body: `Tu código de verificación es ${payload.code}`,
      subject: "Código de verificación",
      providerTemplate,
    };
  }
  return {
    body: `Notificación ${item.eventType}`,
    subject: DEFAULT_SUBJECT,
    providerTemplate,
  };
}
