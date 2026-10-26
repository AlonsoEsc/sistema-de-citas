import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useApiMutation } from "../../lib/mutation";
import { TENANT_QUERY_KEY } from "../../state/tenant";

// ---- Negocio ----

export type BusinessProfileInput = {
  name?: string;
  industry?: string;
  timezone?: string;
  currency?: string;
};

export type BookingSettingsInput = {
  cancelPolicyMinutes?: number;
  bookingWindowDays?: number;
};

export function useSaveBusiness() {
  return useApiMutation({
    mutationFn: async (input: {
      profile: BusinessProfileInput;
      settings: BookingSettingsInput;
    }) => {
      await api.patch("/tenants/me", input.profile);
      await api.patch("/tenants/me/settings", input.settings);
    },
    invalidate: [TENANT_QUERY_KEY, ["appointments"], ["reports"]],
    success: "Cambios guardados.",
    error: "No se pudieron guardar los cambios.",
  });
}

// ---- Avisos ----

export type NotificationTemplate = {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  eventType: string;
  subject: string | null;
  body: string;
  enabled: boolean;
  variablesJson: unknown;
};

const templatesKey = ["notification-templates"];

export function useTemplates() {
  return useQuery({
    queryKey: templatesKey,
    queryFn: async () =>
      (await api.get<NotificationTemplate[]>("/notifications/templates")).data,
  });
}

export function useToggleTemplate() {
  return useApiMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) =>
      (
        await api.patch<NotificationTemplate>(
          `/notifications/templates/${input.id}`,
          { enabled: input.enabled },
        )
      ).data,
    invalidate: [templatesKey],
    success: (template) =>
      template.enabled ? "Aviso activado." : "Aviso desactivado.",
    error: "No se pudo cambiar el aviso.",
  });
}

export function useSaveTemplate() {
  return useApiMutation({
    mutationFn: async (input: { id: string; subject?: string; body: string }) =>
      (
        await api.put<NotificationTemplate>(
          `/notifications/templates/${input.id}`,
          {
            subject: input.subject,
            body: input.body,
          },
        )
      ).data,
    invalidate: [templatesKey],
    success: "Mensaje guardado.",
    error: "No se pudo guardar el mensaje.",
  });
}

// ---- Integraciones ----

export type IntegrationStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "error";

export type Connection = {
  id: string;
  provider: "google_calendar" | "whatsapp" | "email" | "chatwoot";
  scope: "tenant" | "staff";
  staffId: string | null;
  status: IntegrationStatus;
  accountEmail: string | null;
  externalId: string | null;
  lastError: string | null;
  connectedAt: string | null;
};

export type Integrations = {
  configured: { googleCalendar: boolean; sms: boolean; email: boolean };
  connections: Connection[];
};

export type WhatsappSetup = {
  connected: boolean;
  status: IntegrationStatus;
  instanceName: string | null;
  lastError: string | null;
  webhookUrl: string | null;
};

export const integrationKeys = {
  all: ["integrations"] as const,
  whatsapp: ["integrations", "whatsapp"] as const,
};

export function useIntegrations() {
  return useQuery({
    queryKey: integrationKeys.all,
    queryFn: async () => (await api.get<Integrations>("/integrations")).data,
  });
}

export function useWhatsappSetup(enabled = true) {
  return useQuery({
    queryKey: integrationKeys.whatsapp,
    enabled,
    queryFn: async () =>
      (await api.get<WhatsappSetup>("/integrations/whatsapp/setup")).data,
  });
}

const integrationAffected = [
  integrationKeys.all,
  ["onboarding"],
  ["conversations"],
];

export function useConnectEvolution() {
  return useApiMutation({
    mutationFn: async (input: {
      baseUrl: string;
      apiKey: string;
      instanceName: string;
    }) =>
      (
        await api.post<{
          status: IntegrationStatus;
          webhookConfigured: boolean;
        }>("/integrations/whatsapp/evolution/connect", input)
      ).data,
    invalidate: integrationAffected,
    success: (result) =>
      result.status === "connected"
        ? "WhatsApp conectado."
        : "Datos guardados; la instancia aún no está conectada. Escanea el QR en Evolution y vuelve a intentar.",
    error: "No se pudo conectar con Evolution.",
  });
}

export function useConnectChatwoot() {
  return useApiMutation({
    mutationFn: async (input: {
      baseUrl: string;
      apiToken: string;
      accountId: number;
      inboxId: number;
    }) => (await api.post("/integrations/chatwoot/connect", input)).data,
    invalidate: integrationAffected,
    success: "Chatwoot conectado.",
    error: "No se pudo conectar con Chatwoot.",
  });
}

export function useStartGoogle() {
  return useApiMutation({
    mutationFn: async () =>
      (
        await api.post<{ configured: boolean; authUrl?: string }>(
          "/integrations/google/start",
          { scope: "tenant" },
        )
      ).data,
    invalidate: [integrationKeys.all],
  });
}

export function useDisconnect() {
  return useApiMutation({
    mutationFn: async (provider: Connection["provider"]) =>
      (
        await api.post(`/integrations/${provider}/disconnect`, {
          scope: "tenant",
        })
      ).data,
    invalidate: integrationAffected,
    success: "Integración desconectada.",
    error: "No se pudo desconectar.",
  });
}

// ---- Equipo ----

export type Team = {
  members: Array<{
    userId: string;
    email: string;
    fullName: string | null;
    active: boolean;
    emailVerified: boolean;
    roles: string[];
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    expiresAt: string;
  }>;
  roles: Array<{ name: string; label: string }>;
};

const teamKey = ["team"];

export function useTeam() {
  return useQuery({
    queryKey: teamKey,
    queryFn: async () => (await api.get<Team>("/team")).data,
  });
}

export function useInvite() {
  return useApiMutation({
    mutationFn: async (input: { email: string; role: string }) =>
      (await api.post("/team/invitations", input)).data,
    invalidate: [teamKey],
    success: "Invitación enviada.",
    error: "No se pudo enviar la invitación.",
  });
}

export function useRevokeInvitation() {
  return useApiMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/team/invitations/${id}`)).data,
    invalidate: [teamKey],
    success: "Invitación anulada.",
    error: "No se pudo anular la invitación.",
  });
}

export function useUpdateMember() {
  return useApiMutation({
    mutationFn: async (input: {
      userId: string;
      role?: string;
      active?: boolean;
    }) =>
      (
        await api.patch(`/team/members/${input.userId}`, {
          role: input.role,
          active: input.active,
        })
      ).data,
    invalidate: [teamKey],
    success: "Equipo actualizado.",
    error: "No se pudo actualizar.",
  });
}

// ---- Plan ----

export type Plan = {
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  maxStaff: number;
  whatsappMessagesPerMonth: number;
  featuresJson: Record<string, { enabled?: boolean } | undefined> | null;
};

export type Subscription = {
  state: string;
  accessUntil: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  plan: { code: string; name: string; priceCents: number; currency: string };
  payments: Array<{
    id: string;
    amountCents: number;
    currency: string;
    method: string;
    reference: string | null;
    paidAt: string;
    periodEnd: string;
  }>;
} | null;

export type Usage = {
  whatsappMessages: { used: number; included: number };
  staff: { active: number; max: number };
};

export function usePlanData() {
  const subscription = useQuery({
    queryKey: ["subscription"],
    queryFn: async () => (await api.get<Subscription>("/subscription")).data,
  });
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: async () => (await api.get<Usage>("/billing/usage")).data,
  });
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get<Plan[]>("/plans")).data,
    staleTime: 5 * 60_000,
  });
  return { subscription, usage, plans };
}
