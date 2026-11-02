/**
 * Rubros que soporta la plataforma. Cada uno define el vocabulario de la interfaz y los
 * servicios sugeridos al crear el negocio. Los precios son sugerencias en centavos de USD
 * y el negocio los edita desde el panel.
 */

export const INDUSTRY_CODES = [
  "barbershop",
  "beauty_salon",
  "nail_salon",
  "spa",
  "medical_clinic",
  "dental",
  "psychology",
  "physiotherapy",
  "veterinary",
  "fitness",
  "other",
] as const;

export type IndustryCode = (typeof INDUSTRY_CODES)[number];

/** Singular y plural de cada termino que cambia segun el rubro. */
export type Vocabulary = {
  customer: [string, string];
  staff: [string, string];
  service: [string, string];
  appointment: [string, string];
};

export type SuggestedService = {
  name: string;
  durationMinutes: number;
  priceCents: number;
};

export type IndustryProfile = {
  code: IndustryCode;
  label: string;
  vocabulary: Vocabulary;
  suggestedServices: SuggestedService[];
  /** Maneja datos de salud: datos sensibles segun la ley de proteccion de datos. */
  handlesHealthData: boolean;
};

const CLIENT: Vocabulary["customer"] = ["Cliente", "Clientes"];
const PATIENT: Vocabulary["customer"] = ["Paciente", "Pacientes"];
const APPOINTMENT: Vocabulary["appointment"] = ["Cita", "Citas"];

const PROFILES: Record<IndustryCode, Omit<IndustryProfile, "code">> = {
  barbershop: {
    label: "Barbería",
    vocabulary: {
      customer: CLIENT,
      staff: ["Barbero", "Barberos"],
      service: ["Servicio", "Servicios"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [
      { name: "Corte de cabello", durationMinutes: 30, priceCents: 800 },
      { name: "Corte y barba", durationMinutes: 45, priceCents: 1200 },
      { name: "Arreglo de barba", durationMinutes: 20, priceCents: 500 },
    ],
    handlesHealthData: false,
  },
  beauty_salon: {
    label: "Salón de belleza",
    vocabulary: {
      customer: CLIENT,
      staff: ["Estilista", "Estilistas"],
      service: ["Servicio", "Servicios"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [
      { name: "Corte de dama", durationMinutes: 45, priceCents: 1500 },
      { name: "Tinte", durationMinutes: 120, priceCents: 4500 },
      { name: "Peinado", durationMinutes: 45, priceCents: 2000 },
    ],
    handlesHealthData: false,
  },
  nail_salon: {
    label: "Uñas",
    vocabulary: {
      customer: CLIENT,
      staff: ["Manicurista", "Manicuristas"],
      service: ["Servicio", "Servicios"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [
      { name: "Manicure", durationMinutes: 45, priceCents: 1200 },
      { name: "Pedicure", durationMinutes: 60, priceCents: 1500 },
      { name: "Uñas acrílicas", durationMinutes: 90, priceCents: 3000 },
    ],
    handlesHealthData: false,
  },
  spa: {
    label: "Spa",
    vocabulary: {
      customer: CLIENT,
      staff: ["Terapeuta", "Terapeutas"],
      service: ["Tratamiento", "Tratamientos"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [
      { name: "Masaje relajante", durationMinutes: 60, priceCents: 4000 },
      { name: "Limpieza facial", durationMinutes: 60, priceCents: 3500 },
    ],
    handlesHealthData: false,
  },
  medical_clinic: {
    label: "Clínica médica",
    vocabulary: {
      customer: PATIENT,
      staff: ["Médico", "Médicos"],
      service: ["Consulta", "Consultas"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [
      { name: "Consulta general", durationMinutes: 30, priceCents: 2500 },
      { name: "Control", durationMinutes: 20, priceCents: 1500 },
    ],
    handlesHealthData: true,
  },
  dental: {
    label: "Clínica dental",
    vocabulary: {
      customer: PATIENT,
      staff: ["Odontólogo", "Odontólogos"],
      service: ["Tratamiento", "Tratamientos"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [
      { name: "Evaluación", durationMinutes: 30, priceCents: 2000 },
      { name: "Limpieza dental", durationMinutes: 45, priceCents: 3500 },
    ],
    handlesHealthData: true,
  },
  psychology: {
    label: "Psicología",
    vocabulary: {
      customer: PATIENT,
      staff: ["Psicólogo", "Psicólogos"],
      service: ["Sesión", "Sesiones"],
      appointment: ["Sesión", "Sesiones"],
    },
    suggestedServices: [
      { name: "Primera consulta", durationMinutes: 60, priceCents: 4500 },
      { name: "Sesión individual", durationMinutes: 50, priceCents: 4000 },
    ],
    handlesHealthData: true,
  },
  physiotherapy: {
    label: "Fisioterapia",
    vocabulary: {
      customer: PATIENT,
      staff: ["Fisioterapeuta", "Fisioterapeutas"],
      service: ["Sesión", "Sesiones"],
      appointment: ["Sesión", "Sesiones"],
    },
    suggestedServices: [
      { name: "Evaluación", durationMinutes: 60, priceCents: 3500 },
      { name: "Sesión de terapia", durationMinutes: 45, priceCents: 3000 },
    ],
    handlesHealthData: true,
  },
  veterinary: {
    label: "Veterinaria",
    vocabulary: {
      customer: CLIENT,
      staff: ["Veterinario", "Veterinarios"],
      service: ["Servicio", "Servicios"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [
      { name: "Consulta", durationMinutes: 30, priceCents: 2500 },
      { name: "Vacunación", durationMinutes: 15, priceCents: 1500 },
      { name: "Baño y corte", durationMinutes: 60, priceCents: 2000 },
    ],
    handlesHealthData: false,
  },
  fitness: {
    label: "Entrenamiento",
    vocabulary: {
      customer: CLIENT,
      staff: ["Entrenador", "Entrenadores"],
      service: ["Sesión", "Sesiones"],
      appointment: ["Sesión", "Sesiones"],
    },
    suggestedServices: [
      { name: "Entrenamiento personal", durationMinutes: 60, priceCents: 2500 },
    ],
    handlesHealthData: false,
  },
  other: {
    label: "Otro",
    vocabulary: {
      customer: CLIENT,
      staff: ["Profesional", "Profesionales"],
      service: ["Servicio", "Servicios"],
      appointment: APPOINTMENT,
    },
    suggestedServices: [],
    handlesHealthData: false,
  },
};

export function industryProfile(code: IndustryCode): IndustryProfile {
  return { code, ...PROFILES[code] };
}

export const INDUSTRIES: IndustryProfile[] =
  INDUSTRY_CODES.map(industryProfile);
