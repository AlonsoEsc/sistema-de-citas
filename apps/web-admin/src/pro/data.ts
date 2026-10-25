import {
  Professional,
  Service,
  Client,
  Appointment,
  NotificationTemplate,
  IntegrationStatus,
  ScheduledReport,
} from "./types";

export const INITIAL_PROFESSIONALS: Professional[] = [
  {
    id: "p1",
    name: "Andrea Flores",
    email: "andrea.flores@demo.com",
    phone: "+525511223344",
    color: "#0d9488",
  },
  {
    id: "p2",
    name: "Carlos Rivera",
    email: "carlos.rivera@demo.com",
    phone: "+525555667788",
    color: "#2563eb",
  },
];

export const INITIAL_SERVICES: Service[] = [
  { id: "s1", name: "Corte + barba premium", duration: 75, price: 420.0 },
  { id: "s2", name: "Corte clasico", duration: 45, price: 250.0 },
  { id: "s3", name: "Limpieza facial", duration: 30, price: 180.0 },
];

export const INITIAL_CLIENTS: Client[] = [
  {
    id: "c1",
    name: "Alonso Escobar",
    phone: "+76153585",
    email: "lonsoesc99@gmail.com",
  },
  {
    id: "c2",
    name: "Cliente Prueba Codex 4",
    phone: "+50370000004",
    email: "codex4@test.com",
  },
  {
    id: "c3",
    name: "Cliente Prueba Codex",
    phone: "+50370000001",
    email: "codex@test.com",
  },
  {
    id: "c4",
    name: "Delete Check",
    phone: "+525500004444",
    email: "delete_check@test.com",
  },
  {
    id: "c5",
    name: "Delete Check",
    phone: "+525500005555",
    email: "delete_check2@test.com",
  },
  {
    id: "c6",
    name: "Delete Debug",
    phone: "+525500006666",
    email: "debug@test.com",
  },
  {
    id: "c7",
    name: "Delete Debug",
    phone: "+525500007777",
    email: "debug2@test.com",
  },
  {
    id: "c8",
    name: "Delete Debug",
    phone: "+525500008888",
    email: "debug3@test.com",
  },
  {
    id: "c9",
    name: "Delete Test",
    phone: "+525500009999",
    email: "test_delete@test.com",
  },
  {
    id: "c10",
    name: "Cliente Admin Test",
    phone: "+525512345679",
    email: "admin_test@test.com",
  },
  {
    id: "c11",
    name: "Cliente Admin Test",
    phone: "+525512345678",
    email: "admin_test2@test.com",
  },
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: "a1",
    clientId: "c1",
    clientName: "Alonso Escobar",
    clientPhone: "+76153585",
    clientEmail: "lonsoesc99@gmail.com",
    serviceId: "s1",
    serviceName: "Corte + barba premium",
    professionalId: "p1",
    professionalName: "Andrea Flores",
    date: "2026-07-17", // Match current workspace time 2026-07-17
    time: "15:00",
    status: "completed",
    price: 420.0,
    duration: 75,
  },
  {
    id: "a2",
    clientId: "c2",
    clientName: "Cliente Prueba Codex 4",
    clientPhone: "+50370000004",
    clientEmail: "codex4@test.com",
    serviceId: "s2",
    serviceName: "Corte clasico",
    professionalId: "p2",
    professionalName: "Carlos Rivera",
    date: "2026-07-18",
    time: "10:00",
    status: "confirmed",
    price: 250.0,
    duration: 45,
  },
  {
    id: "a3",
    clientId: "c3",
    clientName: "Cliente Prueba Codex",
    clientPhone: "+50370000001",
    clientEmail: "codex@test.com",
    serviceId: "s3",
    serviceName: "Limpieza facial",
    professionalId: "p1",
    professionalName: "Andrea Flores",
    date: "2026-07-16",
    time: "11:15",
    status: "confirmed",
    price: 180.0,
    duration: 30,
  },
];

export const INITIAL_NOTIFICATIONS: NotificationTemplate[] = [
  {
    id: "n1",
    type: "email",
    trigger: "appointment.reminder_24h",
    content:
      "Recordatorio de cita | Hola {{customerName}}, te esperamos mañana a las {{startAt}}.",
    enabled: true,
  },
  {
    id: "n2",
    type: "whatsapp",
    trigger: "appointment.created",
    content: "Tu cita fue creada para {{startAt}} con {{staffName}}.",
    enabled: true,
  },
];

export const INITIAL_INTEGRATIONS: IntegrationStatus = {
  whatsapp: {
    connected: false,
    phoneNumber: "",
    qrCodeUrl:
      "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=agenda-pro-whatsapp-auth-placeholder",
  },
  googleCalendar: {
    connected: false,
    syncedCalendars: ["Agenda Pro - Principal"],
  },
  gmail: {
    connected: false,
    senderEmail: "notificaciones@agendapro.com",
  },
  chatwoot: {
    connected: false,
  },
};

export const INITIAL_SCHEDULED_REPORTS: ScheduledReport[] = [
  {
    id: "sr1",
    name: "Reporte Financiero Diario",
    frequency: "daily",
    recipients: ["admin@demo.com"],
    format: "both",
    channel: "email",
    lastSent: "2026-07-17",
    enabled: true,
  },
  {
    id: "sr2",
    name: "Resumen Operativo Semanal",
    frequency: "weekly",
    recipients: ["admin@demo.com", "andrea.flores@demo.com"],
    format: "pdf",
    channel: "whatsapp",
    lastSent: "2026-07-13",
    enabled: false,
  },
];
