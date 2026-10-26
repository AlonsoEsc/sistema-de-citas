import { formatTime, todayIn, zonedDateTime } from "@citas/shared/time";
import { createContext, useContext, type ReactNode } from "react";

export type TenantProfile = {
  name: string;
  slug: string;
  industry: string;
  vocabulary: {
    customer: [string, string];
    staff: [string, string];
    service: [string, string];
    appointment: [string, string];
  };
  timezone: string;
  currency: string;
  locale: string;
  /** Dias hacia adelante que se pueden reservar. */
  bookingWindowDays: number;
  bookingOpen: boolean;
};

const TenantProfileContext = createContext<TenantProfile | null>(null);

export function TenantProfileProvider({
  profile,
  children,
}: {
  profile: TenantProfile;
  children: ReactNode;
}) {
  return (
    <TenantProfileContext.Provider value={profile}>
      {children}
    </TenantProfileContext.Provider>
  );
}

export function useTenantProfile() {
  const profile = useContext(TenantProfileContext);
  if (!profile) {
    throw new Error("useTenantProfile requiere TenantProfileProvider");
  }
  return profile;
}

/** Fechas y montos siempre en la zona horaria, moneda e idioma del negocio. */
export function formatDateLabel(value: string, profile: TenantProfile) {
  return new Intl.DateTimeFormat(profile.locale, {
    timeZone: profile.timezone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatSlotTime(value: string, profile: TenantProfile) {
  return formatTime(new Date(value), profile.timezone, profile.locale);
}

export function formatCurrency(priceCents: number, profile: TenantProfile) {
  return new Intl.NumberFormat(profile.locale, {
    style: "currency",
    currency: profile.currency,
  }).format(priceCents / 100);
}

export function todayForTenant(profile: TenantProfile) {
  return todayIn(profile.timezone);
}

/** Etiqueta de un dia de calendario del negocio: "lun 27 oct". */
export function formatDayChip(date: string, profile: TenantProfile) {
  const instant = zonedDateTime(date, "12:00", profile.timezone);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(profile.locale, {
      timeZone: profile.timezone,
      ...options,
    }).format(instant);
  return {
    weekday: part({ weekday: "short" }).replace(".", ""),
    day: part({ day: "numeric" }),
    month: part({ month: "short" }).replace(".", ""),
    full: part({ weekday: "long", day: "numeric", month: "long" }),
  };
}

/** Terminos del rubro en minusculas para frases: "tu cita", "elige un servicio". */
export function useTerms() {
  const { vocabulary } = useTenantProfile();
  const lower = (value: string) => value.toLowerCase();
  return {
    customer: lower(vocabulary.customer[0]),
    staffMember: lower(vocabulary.staff[0]),
    service: lower(vocabulary.service[0]),
    appointment: lower(vocabulary.appointment[0]),
    appointments: lower(vocabulary.appointment[1]),
    Staff: vocabulary.staff[0],
    Service: vocabulary.service[0],
    Services: vocabulary.service[1],
    Appointment: vocabulary.appointment[0],
    Appointments: vocabulary.appointment[1],
  };
}
