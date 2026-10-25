import type { TenantTx } from "@citas/db";

/** Claves de entitlements que activan funciones segun el plan del negocio. */
export const ENTITLEMENTS = {
  emailNotifications: "notifications.email.enabled",
  smsNotifications: "notifications.sms.enabled",
  whatsappNotifications: "notifications.whatsapp.enabled",
} as const;

export type EntitlementMap = Record<string, unknown>;

export async function loadEntitlements(db: TenantTx): Promise<EntitlementMap> {
  const rows = await db.tenantEntitlement.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.valueJson]));
}

export function isEnabled(
  entitlements: EntitlementMap,
  key: string,
  defaultValue = false,
) {
  const value = entitlements[key] as { enabled?: boolean } | undefined;
  return value?.enabled ?? defaultValue;
}
