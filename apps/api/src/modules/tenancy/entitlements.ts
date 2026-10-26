import type { TenantTx } from "@citas/db";

/** Funciones que se habilitan por plan (Plan.featuresJson) o por excepcion del negocio. */
export const ENTITLEMENTS = {
  emailNotifications: "notifications.email.enabled",
  smsNotifications: "notifications.sms.enabled",
  whatsappNotifications: "notifications.whatsapp.enabled",
  advancedReports: "reports.advanced.enabled",
  whatsappAssistant: "whatsapp.assistant.enabled",
} as const;

export type EntitlementMap = Record<string, unknown>;

/** Funciones del plan con las excepciones del negocio (TenantEntitlement) por encima. */
export function mergeEntitlements(
  planFeatures: unknown,
  overrides: Array<{ key: string; valueJson: unknown }>,
): EntitlementMap {
  const base =
    planFeatures &&
    typeof planFeatures === "object" &&
    !Array.isArray(planFeatures)
      ? (planFeatures as EntitlementMap)
      : {};
  return {
    ...base,
    ...Object.fromEntries(overrides.map((row) => [row.key, row.valueJson])),
  };
}

export async function loadEntitlements(db: TenantTx): Promise<EntitlementMap> {
  const [subscription, overrides] = await Promise.all([
    db.subscription.findFirst({ include: { plan: true } }),
    db.tenantEntitlement.findMany(),
  ]);
  return mergeEntitlements(subscription?.plan.featuresJson, overrides);
}

export function isEnabled(
  entitlements: EntitlementMap,
  key: string,
  defaultValue = false,
) {
  const value = entitlements[key] as { enabled?: boolean } | undefined;
  return value?.enabled ?? defaultValue;
}
