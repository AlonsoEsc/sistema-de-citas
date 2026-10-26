import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IndustryCode, Vocabulary } from "@citas/shared/industries";
import { ENTITLEMENTS } from "@citas/shared/billing";
import { api } from "../lib/api";
import { apiErrorMessage } from "../lib/errors";
import { createFormatter, type Formatter } from "../lib/format";
import { ErrorState, Skeleton } from "../components/ui/surface";

export type SubscriptionState =
  | "trialing"
  | "active"
  | "past_due"
  | "expired"
  | "canceled";

export type TenantMe = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    industry: IndustryCode;
    timezone: string;
    currency: string;
    locale: string;
    settings: {
      cancelPolicyMinutes: number;
      bookingWindowDays: number;
    } | null;
  };
  industry: {
    label: string;
    vocabulary: Vocabulary;
    handlesHealthData: boolean;
  };
  bookingUrl: string;
  subscription: {
    state: SubscriptionState;
    accessUntil: string | null;
    planCode: string | null;
  };
  access: "full" | "read_only";
  entitlements: Record<string, { enabled?: boolean } | undefined>;
  limits: { maxStaff: number; whatsappMessagesPerMonth: number };
};

export const TENANT_QUERY_KEY = ["tenant-me"] as const;

export function useTenantQuery() {
  return useQuery({
    queryKey: TENANT_QUERY_KEY,
    queryFn: async () => (await api.get<TenantMe>("/tenants/me")).data,
    staleTime: 60_000,
  });
}

/** Terminos del rubro: "Paciente/Pacientes" en una clinica, "Cliente/Clientes" en una barberia. */
function termsOf(vocabulary: Vocabulary) {
  return {
    customer: vocabulary.customer[0],
    customers: vocabulary.customer[1],
    staffMember: vocabulary.staff[0],
    staff: vocabulary.staff[1],
    service: vocabulary.service[0],
    services: vocabulary.service[1],
    appointment: vocabulary.appointment[0],
    appointments: vocabulary.appointment[1],
  };
}

export type Terms = ReturnType<typeof termsOf>;

type TenantContextValue = TenantMe & {
  terms: Terms;
  format: Formatter;
  readOnly: boolean;
  hasFeature: (
    key: (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS],
  ) => boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

/** Carga el negocio una vez y lo comparte: vocabulario, zona horaria, moneda y plan. */
export function TenantProvider({ children }: { children: ReactNode }) {
  const query = useTenantQuery();

  const value = useMemo<TenantContextValue | null>(() => {
    if (!query.data) {
      return null;
    }
    const data = query.data;
    return {
      ...data,
      terms: termsOf(data.industry.vocabulary),
      format: createFormatter(data.tenant),
      readOnly: data.access === "read_only",
      hasFeature: (key) => data.entitlements[key]?.enabled === true,
    };
  }, [query.data]);

  if (query.isError) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <ErrorState
          message={apiErrorMessage(
            query.error,
            "No se pudo cargar tu negocio.",
          )}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (!value) {
    return (
      <div className="flex min-h-screen bg-bg" role="status">
        <span className="sr-only">Cargando tu negocio…</span>
        <Skeleton className="m-4 hidden w-60 md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant debe usarse dentro de TenantProvider");
  }
  return context;
}
