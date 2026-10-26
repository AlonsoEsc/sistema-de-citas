import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { PERMISSIONS, type PermissionKey } from "@citas/shared/access";
import { LoadingRows } from "../components/ui/surface";
import { useAuth } from "../state/auth";
import { TenantProvider } from "../state/tenant";
import { AppShell } from "./AppShell";

/** Carga diferida por pantalla: el panel inicial no descarga graficas ni el QR. */
function page<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] }));
}

const OverviewPage = page(
  () => import("../features/overview/OverviewPage"),
  "OverviewPage",
);
const AgendaPage = page(
  () => import("../features/agenda/AgendaPage"),
  "AgendaPage",
);
const ConversationsPage = page(
  () => import("../features/conversations/ConversationsPage"),
  "ConversationsPage",
);
const CustomersPage = page(
  () => import("../features/customers/CustomersPage"),
  "CustomersPage",
);
const CatalogPage = page(
  () => import("../features/catalog/CatalogPage"),
  "CatalogPage",
);
const ReportsPage = page(
  () => import("../features/reports/ReportsPage"),
  "ReportsPage",
);
const PortalPage = page(
  () => import("../features/portal/PortalPage"),
  "PortalPage",
);
const SettingsPage = page(
  () => import("../features/settings/SettingsPage"),
  "SettingsPage",
);
const AccountPage = page(
  () => import("../features/account/AccountPage"),
  "AccountPage",
);

function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { can } = useAuth();
  return can(permission) ? children : <Navigate to="/resumen" replace />;
}

/** Panel del negocio: una ruta por seccion, todas dentro del mismo armazon. */
export function AdminApp() {
  return (
    <TenantProvider>
      <AppShell>
        <Suspense fallback={<LoadingRows rows={4} />}>
          <Routes>
            <Route path="/" element={<Navigate to="/resumen" replace />} />
            <Route path="/resumen" element={<OverviewPage />} />
            <Route path="/agenda" element={<AgendaPage />} />
            <Route
              path="/conversaciones"
              element={
                <RequirePermission permission={PERMISSIONS.appointmentsManage}>
                  <ConversationsPage />
                </RequirePermission>
              }
            />
            <Route path="/clientes" element={<CustomersPage />} />
            <Route path="/catalogo" element={<CatalogPage />} />
            <Route
              path="/reportes"
              element={
                <RequirePermission permission={PERMISSIONS.reportsView}>
                  <ReportsPage />
                </RequirePermission>
              }
            />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/ajustes/*" element={<SettingsPage />} />
            <Route path="/cuenta" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/resumen" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </TenantProvider>
  );
}
