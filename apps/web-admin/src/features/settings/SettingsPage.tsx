import { Navigate, Route, Routes } from "react-router";
import { PERMISSIONS } from "@citas/shared/access";
import { PageHeader } from "../../components/ui/surface";
import { RouteTabs } from "../../components/ui/tabs";
import { useAuth } from "../../state/auth";
import { BusinessTab } from "./BusinessTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { NotificationsTab } from "./NotificationsTab";
import { PlanTab } from "./PlanTab";
import { TeamTab } from "./TeamTab";

const MANAGED_TABS = [
  { path: "negocio", label: "Negocio", element: <BusinessTab /> },
  { path: "avisos", label: "Avisos", element: <NotificationsTab /> },
  {
    path: "integraciones",
    label: "Integraciones",
    element: <IntegrationsTab />,
  },
  { path: "equipo", label: "Usuarios", element: <TeamTab /> },
];

/** Ajustes del negocio. Sin permiso de configuracion solo se ve el plan y el consumo. */
export function SettingsPage() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.settingsManage);
  const tabs = [
    ...(canManage ? MANAGED_TABS : []),
    { path: "plan", label: "Plan y consumo", element: <PlanTab /> },
  ];

  return (
    <>
      <PageHeader title="Ajustes" />
      <RouteTabs
        label="Secciones de ajustes"
        tabs={tabs.map((tab) => ({
          to: `/ajustes/${tab.path}`,
          label: tab.label,
        }))}
      />
      <Routes>
        {tabs.map((tab) => (
          <Route key={tab.path} path={tab.path} element={tab.element} />
        ))}
        <Route path="*" element={<Navigate to={tabs[0].path} replace />} />
      </Routes>
    </>
  );
}
