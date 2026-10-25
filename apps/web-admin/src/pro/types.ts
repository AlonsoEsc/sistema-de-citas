export interface Professional {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  color?: string; // Hex color for calendar
}

export interface Service {
  id: string;
  name: string;
  duration: number; // in minutes
  price: number; // in cents or dollars (we will use dollars for simpler UI, e.g. 420.00)
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled";

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: AppointmentStatus;
  price: number;
  duration: number;
}

export interface NotificationTemplate {
  id: string;
  type: "email" | "whatsapp";
  trigger: string;
  content: string;
  enabled: boolean;
  providerTemplateName?: string;
  providerTemplateLanguage?: string;
  providerParameterOrder?: string[];
}

export interface IntegrationStatus {
  whatsapp: {
    connected: boolean;
    phoneNumber?: string;
    qrCodeUrl?: string;
    token?: string;
  };
  googleCalendar: {
    connected: boolean;
    syncedCalendars: string[];
    accountEmail?: string;
  };
  gmail: {
    connected: boolean;
    senderEmail?: string;
    smtpHost?: string;
    smtpPort?: string;
  };
  chatwoot: {
    connected: boolean;
    inboxId?: string;
    inboxName?: string;
  };
}

export interface ScheduledReport {
  id: string;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  recipients: string[];
  format: "pdf" | "excel" | "both";
  channel: "email" | "whatsapp";
  lastSent?: string;
  enabled: boolean;
}
