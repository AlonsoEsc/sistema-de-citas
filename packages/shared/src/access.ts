/** Permisos del panel de un negocio. Fuente unica para la API, el seed y el alta de negocios. */
export const PERMISSIONS = {
  appointmentsManage: "appointments.manage",
  staffManage: "staff.manage",
  servicesManage: "services.manage",
  customersManage: "customers.manage",
  reportsView: "reports.view",
  settingsManage: "settings.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  "appointments.manage": "Crear y modificar citas",
  "staff.manage": "Gestionar personal y horarios",
  "services.manage": "Gestionar servicios",
  "customers.manage": "Gestionar clientes",
  "reports.view": "Ver reportes",
  "settings.manage": "Gestionar ajustes, equipo, integraciones y plan",
};

/** El rol owner tiene todos los permisos aunque RolePermission no este sembrado. */
export const OWNER_ROLE = "owner";

/** Roles con los que nace todo negocio. */
export const DEFAULT_ROLES: Record<string, PermissionKey[]> = {
  [OWNER_ROLE]: Object.values(PERMISSIONS),
  receptionist: [PERMISSIONS.appointmentsManage, PERMISSIONS.customersManage],
  staff: [PERMISSIONS.appointmentsManage],
};

export const ROLE_LABELS: Record<string, string> = {
  [OWNER_ROLE]: "Dueño",
  receptionist: "Recepción",
  staff: "Personal",
};
