import { mergeEntitlements, type EntitlementMap } from "@citas/shared/billing";
import type { TenantTx } from "@citas/db";

export {
  ENTITLEMENTS,
  isEnabled,
  mergeEntitlements,
  type EntitlementMap,
} from "@citas/shared/billing";

export async function loadEntitlements(db: TenantTx): Promise<EntitlementMap> {
  const [subscription, overrides] = await Promise.all([
    db.subscription.findFirst({ include: { plan: true } }),
    db.tenantEntitlement.findMany(),
  ]);
  return mergeEntitlements(subscription?.plan.featuresJson, overrides);
}
