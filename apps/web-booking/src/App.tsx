import { useMemo } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { PortalMessage } from "./components/ui";
import { PortalApp } from "./features/PortalApp";
import { bookingApi, tenantSlug } from "./lib/api";
import {
  TenantProfileProvider,
  type TenantProfile,
} from "./lib/tenant-profile";

function TenantPortal({ slug }: { slug: string }) {
  const profile = useQuery({
    queryKey: ["tenant-profile", slug],
    retry: false,
    queryFn: async () =>
      (await bookingApi.get<TenantProfile>(`/public/${slug}/profile`)).data,
  });

  if (profile.isPending) {
    return (
      <PortalMessage title="Cargando…">Un momento, por favor.</PortalMessage>
    );
  }
  if (profile.isError) {
    return (
      <PortalMessage title="Negocio no encontrado">
        Revisa el enlace que te compartió el negocio.
      </PortalMessage>
    );
  }
  if (!profile.data.bookingOpen) {
    return (
      <PortalMessage title={profile.data.name}>
        Este negocio no está recibiendo reservas en línea en este momento.
        Comunícate directamente con ellos.
      </PortalMessage>
    );
  }
  return (
    <TenantProfileProvider profile={profile.data}>
      <PortalApp slug={slug} />
    </TenantProfileProvider>
  );
}

export function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      {tenantSlug ? (
        <TenantPortal slug={tenantSlug} />
      ) : (
        <PortalMessage title="Reserva tu cita">
          Abre el enlace de reservas que te compartió el negocio (por ejemplo,
          reservas.tudominio.com/nombre-del-negocio).
        </PortalMessage>
      )}
    </QueryClientProvider>
  );
}
