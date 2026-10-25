export const PERMISSIONS = {
  appointmentsManage: "appointments.manage",
  staffManage: "staff.manage",
  servicesManage: "services.manage",
  customersManage: "customers.manage",
  reportsView: "reports.view",
  settingsManage: "settings.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** El rol owner tiene todos los permisos aunque RolePermission no este sembrado. */
export const OWNER_ROLE = "owner";
