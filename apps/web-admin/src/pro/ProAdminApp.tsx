import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Dashboard from "./components/Dashboard";
import Agenda from "./components/Agenda";
import Catalogos from "./components/Catalogos";
import Reportes from "./components/Reportes";
import Ajustes from "./components/Ajustes";
import PortalClientes from "./components/PortalClientes";
import Conversations from "./components/Conversations";
import UnifiedShell, { type AdminTheme } from "./components/UnifiedShell";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import "./unified-shell.css";
import type {
  Appointment,
  AppointmentStatus,
  Client,
  IntegrationStatus,
  NotificationTemplate,
  Professional,
  ScheduledReport,
  Service,
} from "./types";
import type {
  Appointment as ApiAppointment,
  Customer as ApiCustomer,
  Service as ApiService,
  Staff,
} from "../lib/types";
import { PRODUCT_NAME } from "../config/brand";
import { AccountBanner } from "../components/AccountBanner";

type ApiTemplate = {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  eventType: string;
  body: string;
  subject?: string | null;
  variablesJson?: {
    evolution?: {
      name?: string;
      language?: string;
      parameterOrder?: string[];
    };
  } | null;
};

const colors = [
  "#1a73e8",
  "#0d9488",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
];

const initialIntegration: IntegrationStatus = {
  whatsapp: {
    connected: false,
    phoneNumber: "",
    qrCodeUrl:
      "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=whatsapp-auth-placeholder",
  },
  googleCalendar: {
    connected: false,
    syncedCalendars: [`${PRODUCT_NAME} - Principal`],
  },
  gmail: {
    connected: false,
    senderEmail: "",
  },
  chatwoot: {
    connected: false,
  },
};

const initialScheduledReports: ScheduledReport[] = [
  {
    id: "sr_default_weekly",
    name: "Resumen Operativo Semanal",
    frequency: "weekly",
    recipients: ["admin@demo.com"],
    format: "pdf",
    channel: "email",
    enabled: true,
  },
];

type ApiIntegrationConnection = {
  id: string;
  provider: "google_calendar" | "whatsapp" | "email" | "chatwoot";
  scope: "tenant" | "staff";
  scopeKey: string;
  staffId: string | null;
  status: "disconnected" | "pending" | "connected" | "error";
  accountEmail: string | null;
  externalId: string | null;
  metadata: unknown;
  lastError: string | null;
  connectedAt: string | null;
  updatedAt: string;
};

type IntegrationsResponse = {
  configured: {
    googleCalendar: boolean;
    whatsapp: boolean;
    email: boolean;
  };
  connections: ApiIntegrationConnection[];
};

type WhatsappSetup = {
  connected: boolean;
  status: "disconnected" | "pending" | "connected" | "error";
  connectionId: string | null;
  instanceName: string | null;
  provider: string | null;
  mode: string | null;
  lastError: string | null;
  webhookUrl: string | null;
};

type ApiSubscription = {
  status: string;
  currentPeriodEnd: string | null;
  plan: {
    name: string;
    priceCents: number;
    billingPeriod: string;
  };
};

type ApiScheduledReport = {
  id: string;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  format: "pdf" | "excel" | "both";
  channel: "email" | "whatsapp";
  enabled: boolean;
  lastSentAt: string | null;
};

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function timeOnly(value: string) {
  return new Date(value).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toMoney(priceCents: number) {
  return priceCents / 100;
}

function mapProfessionals(staff: Staff[]): Professional[] {
  return staff
    .filter((item) => item.active)
    .map((item, index) => ({
      id: item.id,
      name: item.displayName,
      phone: item.phone ?? undefined,
      color: colors[index % colors.length],
    }));
}

function mapServices(services: ApiService[]): Service[] {
  return services
    .filter((item) => item.active)
    .map((item) => ({
      id: item.id,
      name: item.name,
      duration: item.durationMinutes,
      price: toMoney(item.priceCents),
    }));
}

function mapClients(customers: ApiCustomer[]): Client[] {
  return customers.map((item) => ({
    id: item.id,
    name: item.fullName,
    phone: item.phone ?? "",
    email: item.email ?? "",
  }));
}

function mapAppointments(appointments: ApiAppointment[]): Appointment[] {
  return appointments.map((item) => {
    const firstService = item.services[0]?.service;
    const totalDuration = item.services.reduce(
      (sum, entry) => sum + entry.service.durationMinutes,
      0,
    );
    return {
      id: item.id,
      clientId: item.customer.id,
      clientName: item.customer.fullName,
      clientPhone: item.customer.phone ?? "",
      clientEmail: item.customer.email ?? undefined,
      serviceId: firstService?.id ?? "",
      serviceName:
        item.services.map((entry) => entry.service.name).join(", ") ||
        "Servicio",
      professionalId: item.staff.id,
      professionalName: item.staff.displayName,
      date: dateOnly(item.startAt),
      time: timeOnly(item.startAt),
      status: item.status,
      price: toMoney(item.priceCents),
      duration: totalDuration,
    };
  });
}

function mapTemplates(templates: ApiTemplate[]): NotificationTemplate[] {
  return templates.map((item) => ({
    id: item.id,
    type: item.channel === "whatsapp" ? "whatsapp" : "email",
    trigger: item.eventType,
    content: item.subject ? `${item.subject} | ${item.body}` : item.body,
    enabled: true,
    providerTemplateName: item.variablesJson?.evolution?.name,
    providerTemplateLanguage: item.variablesJson?.evolution?.language,
    providerParameterOrder: item.variablesJson?.evolution?.parameterOrder,
  }));
}

function mapScheduledReports(rows: ApiScheduledReport[]): ScheduledReport[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    recipients: row.recipients,
    format: row.format,
    channel: row.channel,
    lastSent: row.lastSentAt ?? undefined,
    enabled: row.enabled,
  }));
}

function mapIntegrationStatus(
  data?: IntegrationsResponse,
  fallback: IntegrationStatus = initialIntegration,
) {
  const google = data?.connections.find(
    (item) => item.provider === "google_calendar" && item.scope === "tenant",
  );
  const whatsapp = data?.connections.find(
    (item) => item.provider === "whatsapp" && item.scope === "tenant",
  );
  const email = data?.connections.find(
    (item) => item.provider === "email" && item.scope === "tenant",
  );
  const chatwoot = data?.connections.find(
    (item) => item.provider === "chatwoot" && item.scope === "tenant",
  );

  return {
    whatsapp: {
      connected: whatsapp?.status === "connected",
      phoneNumber: whatsapp?.externalId ?? fallback.whatsapp.phoneNumber,
      qrCodeUrl: fallback.whatsapp.qrCodeUrl,
    },
    googleCalendar: {
      connected: google?.status === "connected",
      syncedCalendars:
        google?.status === "connected"
          ? [`${PRODUCT_NAME} - Principal`]
          : fallback.googleCalendar.syncedCalendars,
      accountEmail:
        google?.accountEmail ?? fallback.googleCalendar.accountEmail,
    },
    gmail: {
      connected: email?.status === "connected",
      senderEmail: email?.accountEmail ?? fallback.gmail.senderEmail,
    },
    chatwoot: {
      connected: chatwoot?.status === "connected",
      inboxId: chatwoot?.externalId ?? fallback.chatwoot.inboxId,
      inboxName:
        (chatwoot?.metadata as { inboxName?: string } | null)?.inboxName ??
        fallback.chatwoot.inboxName,
    },
  } satisfies IntegrationStatus;
}

export function ProAdminApp() {
  const queryClient = useQueryClient();
  const { session, logout, can } = useAuth();
  const canManageSettings = can("settings.manage");
  const canViewReports = can("reports.view");
  const [activeTab, setActiveTab] = useState("conversaciones");
  const [adminTheme, setAdminTheme] = useState<AdminTheme>(() => {
    const saved = localStorage.getItem("admin-theme");
    return saved === "dark" ? "dark" : "light";
  });
  const [integration, setIntegration] =
    useState<IntegrationStatus>(initialIntegration);

  useEffect(() => {
    localStorage.setItem("admin-theme", adminTheme);
    document.documentElement.style.colorScheme = adminTheme;
  }, [adminTheme]);

  const range = useMemo(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
      to: new Date(now.getFullYear() + 1, 11, 31).toISOString(),
    };
  }, []);

  const staffQuery = useQuery({
    queryKey: ["pro-staff"],
    queryFn: async () => (await api.get<Staff[]>("/staff")).data,
  });

  const servicesQuery = useQuery({
    queryKey: ["pro-services"],
    queryFn: async () => (await api.get<ApiService[]>("/services")).data,
  });

  const customersQuery = useQuery({
    queryKey: ["pro-customers"],
    queryFn: async () => (await api.get<ApiCustomer[]>("/customers")).data,
  });

  const appointmentsQuery = useQuery({
    queryKey: ["pro-appointments", range.from, range.to],
    queryFn: async () =>
      (
        await api.get<ApiAppointment[]>("/appointments", {
          params: range,
        })
      ).data,
  });

  const templatesQuery = useQuery({
    queryKey: ["pro-templates"],
    queryFn: async () =>
      (await api.get<ApiTemplate[]>("/notifications/templates")).data,
    enabled: canManageSettings,
  });

  const integrationsQuery = useQuery({
    queryKey: ["pro-integrations"],
    queryFn: async () =>
      (await api.get<IntegrationsResponse>("/integrations")).data,
    enabled: canManageSettings,
  });

  const whatsappSetupQuery = useQuery({
    queryKey: ["pro-whatsapp-setup"],
    queryFn: async () =>
      (await api.get<WhatsappSetup>("/integrations/whatsapp/setup")).data,
    enabled: canManageSettings,
  });

  const scheduledReportsQuery = useQuery({
    queryKey: ["pro-scheduled-reports"],
    queryFn: async () =>
      (await api.get<ApiScheduledReport[]>("/reports/scheduled")).data,
    enabled: canViewReports,
  });

  const subscriptionQuery = useQuery({
    queryKey: ["pro-subscription"],
    queryFn: async () =>
      (await api.get<ApiSubscription | null>("/subscription")).data,
  });

  const professionals = useMemo(
    () => mapProfessionals(staffQuery.data ?? []),
    [staffQuery.data],
  );
  const services = useMemo(
    () => mapServices(servicesQuery.data ?? []),
    [servicesQuery.data],
  );
  const clients = useMemo(
    () => mapClients(customersQuery.data ?? []),
    [customersQuery.data],
  );
  const appointments = useMemo(
    () => mapAppointments(appointmentsQuery.data ?? []),
    [appointmentsQuery.data],
  );
  const notifications = useMemo(
    () => mapTemplates(templatesQuery.data ?? []),
    [templatesQuery.data],
  );
  const effectiveIntegration = useMemo(
    () => mapIntegrationStatus(integrationsQuery.data, integration),
    [integrationsQuery.data, integration],
  );
  const scheduledReports = useMemo(
    () =>
      scheduledReportsQuery.data
        ? mapScheduledReports(scheduledReportsQuery.data)
        : initialScheduledReports,
    [scheduledReportsQuery.data],
  );

  const invalidateOperationalData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pro-appointments"] }),
      queryClient.invalidateQueries({ queryKey: ["pro-customers"] }),
      queryClient.invalidateQueries({ queryKey: ["pro-staff"] }),
      queryClient.invalidateQueries({ queryKey: ["pro-services"] }),
    ]);
  };

  const createAppointment = useMutation({
    mutationFn: async (appointment: Omit<Appointment, "id">) =>
      api.post("/appointments", {
        staffId: appointment.professionalId,
        customerId: appointment.clientId,
        serviceIds: [appointment.serviceId],
        startAt: new Date(
          `${appointment.date}T${appointment.time}:00`,
        ).toISOString(),
      }),
    onSuccess: invalidateOperationalData,
  });

  const updateAppointmentStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: AppointmentStatus;
    }) =>
      api.patch(`/appointments/${id}/status`, {
        status,
        suppressNotifications: true,
      }),
    onSuccess: invalidateOperationalData,
  });

  const deleteAppointment = useMutation({
    mutationFn: async (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: invalidateOperationalData,
  });

  const createStaff = useMutation({
    mutationFn: async (name: string) =>
      api.post("/staff", { displayName: name }),
    onSuccess: invalidateOperationalData,
  });

  const deactivateStaff = useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/staff/${id}`, { active: false }),
    onSuccess: invalidateOperationalData,
  });

  const createService = useMutation({
    mutationFn: async (service: Omit<Service, "id">) =>
      api.post("/services", {
        name: service.name,
        durationMinutes: service.duration,
        priceCents: Math.round(service.price * 100),
      }),
    onSuccess: invalidateOperationalData,
  });

  const deactivateService = useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/services/${id}`, { active: false }),
    onSuccess: invalidateOperationalData,
  });

  const createClient = useMutation({
    mutationFn: async (client: Omit<Client, "id">) =>
      api.post("/customers", {
        fullName: client.name,
        phone: client.phone,
        email: client.email || undefined,
      }),
    onSuccess: invalidateOperationalData,
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const [subject, ...bodyParts] = content.split("|");
      const body = bodyParts.length ? bodyParts.join("|").trim() : content;
      return api.put(`/notifications/templates/${id}`, {
        subject: bodyParts.length ? subject.trim() : undefined,
        body,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pro-templates"] });
    },
  });

  const updateProviderTemplate = useMutation({
    mutationFn: async ({
      id,
      name,
      language,
      parameterOrder,
    }: {
      id: string;
      name: string;
      language: string;
      parameterOrder: string[];
    }) =>
      api.put(`/notifications/templates/${id}/provider`, {
        evolution: { name, language, parameterOrder },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pro-templates"] });
    },
  });

  const upsertIntegration = useMutation({
    mutationFn: async ({
      provider,
      status,
      accountEmail,
      externalId,
      metadata,
    }: {
      provider: "google_calendar" | "whatsapp" | "email";
      status: "disconnected" | "pending" | "connected" | "error";
      accountEmail?: string;
      externalId?: string;
      metadata?: Record<string, unknown>;
    }) =>
      api.post(`/integrations/${provider}/config`, {
        scope: "tenant",
        status,
        accountEmail,
        externalId,
        metadata,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pro-integrations"] });
    },
  });

  const disconnectWhatsapp = useMutation({
    mutationFn: async () =>
      api.post("/integrations/whatsapp/disconnect", {
        scope: "tenant",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pro-integrations"] }),
        queryClient.invalidateQueries({ queryKey: ["pro-whatsapp-setup"] }),
      ]);
    },
  });

  const connectChatwoot = useMutation({
    mutationFn: async (config: {
      baseUrl: string;
      apiToken: string;
      accountId: number;
      inboxId: number;
    }) => api.post("/integrations/chatwoot/connect", config),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pro-integrations"] });
    },
  });

  const disconnectChatwoot = useMutation({
    mutationFn: async () =>
      api.post("/integrations/chatwoot/disconnect", { scope: "tenant" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pro-integrations"] });
    },
  });

  const createScheduledReport = useMutation({
    mutationFn: async (report: Omit<ScheduledReport, "id">) =>
      api.post("/reports/scheduled", {
        name: report.name,
        frequency: report.frequency,
        recipients: report.recipients,
        format: report.format,
        channel: report.channel,
        enabled: report.enabled,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pro-scheduled-reports"],
      });
    },
  });

  const deleteScheduledReport = useMutation({
    mutationFn: async (id: string) => api.delete(`/reports/scheduled/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["pro-scheduled-reports"],
      });
    },
  });

  function persistIntegrationStatus(next: IntegrationStatus) {
    setIntegration({
      ...next,
      whatsapp: effectiveIntegration.whatsapp,
    });

    if (
      next.googleCalendar.connected !==
      effectiveIntegration.googleCalendar.connected
    ) {
      upsertIntegration.mutate({
        provider: "google_calendar",
        status: next.googleCalendar.connected ? "connected" : "disconnected",
        accountEmail: next.googleCalendar.accountEmail,
        metadata: { source: "settings_ui", mode: "placeholder_until_oauth" },
      });
    }

    if (next.gmail.connected !== effectiveIntegration.gmail.connected) {
      upsertIntegration.mutate({
        provider: "email",
        status: next.gmail.connected ? "connected" : "disconnected",
        accountEmail: next.gmail.senderEmail,
        metadata: { source: "settings_ui" },
      });
    }
  }

  const hiddenTabs = [
    ...(canManageSettings ? [] : ["ajustes"]),
    ...(canViewReports ? [] : ["reportes"]),
  ];

  const isLoading =
    staffQuery.isLoading ||
    servicesQuery.isLoading ||
    customersQuery.isLoading ||
    appointmentsQuery.isLoading ||
    templatesQuery.isLoading ||
    integrationsQuery.isLoading ||
    scheduledReportsQuery.isLoading ||
    subscriptionQuery.isLoading;

  return (
    <UnifiedShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      theme={adminTheme}
      setTheme={setAdminTheme}
      tenantName={session?.tenant.name ?? "Tu negocio"}
      email={session?.user.email ?? "admin"}
      appointments={appointments}
      onLogout={logout}
      hiddenTabs={hiddenTabs}
    >
      <>
        <AccountBanner />
        {isLoading && (
          <div className="mb-4 rounded-2xl border border-[#2a2a2a] bg-[#121212] p-4 text-xs font-bold text-gray-400">
            Cargando datos reales de {session?.tenant.name ?? "tu negocio"}...
          </div>
        )}

        {activeTab === "conversaciones" && (
          <Conversations
            clients={clients}
            appointments={appointments}
            onConfirmWithoutNotifications={async (id) => {
              await updateAppointmentStatus.mutateAsync({
                id,
                status: "confirmed",
              });
            }}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === "resumen" && (
          <Dashboard
            appointments={appointments}
            professionals={professionals}
            services={services}
          />
        )}

        {activeTab === "agenda" && (
          <Agenda
            appointments={appointments}
            professionals={professionals}
            services={services}
            clients={clients}
            onAddAppointment={(appointment) =>
              createAppointment.mutate(appointment)
            }
            onUpdateAppointmentStatus={(id, status) =>
              updateAppointmentStatus.mutate({ id, status })
            }
            onDeleteAppointment={(id) => deleteAppointment.mutate(id)}
          />
        )}

        {activeTab === "catalogos" && (
          <Catalogos
            professionals={professionals}
            services={services}
            clients={clients}
            onAddProfessional={(name) => createStaff.mutate(name)}
            onDeleteProfessional={(id) => deactivateStaff.mutate(id)}
            onAddService={(service) => createService.mutate(service)}
            onDeleteService={(id) => deactivateService.mutate(id)}
            onAddClient={(client) => createClient.mutate(client)}
            onDeleteClient={() => {
              window.alert(
                "El backend aún no tiene endpoint para eliminar clientes; por ahora se conservan por historial.",
              );
            }}
          />
        )}

        {activeTab === "reportes" && canViewReports && (
          <Reportes
            appointments={appointments}
            professionals={professionals}
            services={services}
            scheduledReports={scheduledReports}
            onAddScheduledReport={(report) =>
              createScheduledReport.mutate(report)
            }
            onDeleteScheduledReport={(id) => deleteScheduledReport.mutate(id)}
          />
        )}

        {activeTab === "ajustes" && canManageSettings && (
          <Ajustes
            subscription={subscriptionQuery.data}
            notifications={notifications}
            onToggleNotification={() => {
              window.alert(
                "La activación/desactivación visual está pendiente de persistencia en backend.",
              );
            }}
            onUpdateNotificationContent={(id, content) =>
              updateTemplate.mutate({ id, content })
            }
            onUpdateWhatsappProviderTemplate={async (
              id,
              name,
              language,
              parameterOrder,
            ) => {
              await updateProviderTemplate.mutateAsync({
                id,
                name,
                language,
                parameterOrder,
              });
            }}
            integration={{
              ...effectiveIntegration,
              googleCalendar: {
                ...effectiveIntegration.googleCalendar,
                accountEmail:
                  effectiveIntegration.googleCalendar.accountEmail ??
                  session?.user.email,
              },
            }}
            onUpdateIntegration={persistIntegrationStatus}
            onConnectWhatsapp={async () => {
              window.alert(
                "WhatsApp está pausado por seguridad. La configuración se conserva, pero no se iniciará la conexión.",
              );
            }}
            onDisconnectWhatsapp={async () => {
              await disconnectWhatsapp.mutateAsync();
            }}
            whatsappLastError={whatsappSetupQuery.data?.lastError}
            onConnectChatwoot={async (config) => {
              await connectChatwoot.mutateAsync(config);
            }}
            onDisconnectChatwoot={async () => {
              await disconnectChatwoot.mutateAsync();
            }}
          />
        )}

        {activeTab === "portal" && (
          <PortalClientes
            appointments={appointments}
            professionals={professionals}
            services={services}
            clients={clients}
            onAddAppointment={(appointment) =>
              createAppointment.mutate(appointment)
            }
            onAddClient={(client) => createClient.mutate(client)}
            onCancelAppointment={(id) =>
              updateAppointmentStatus.mutate({ id, status: "cancelled" })
            }
          />
        )}
      </>
    </UnifiedShell>
  );
}
