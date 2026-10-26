import { formatTime, todayIn } from "@citas/shared/time";
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
