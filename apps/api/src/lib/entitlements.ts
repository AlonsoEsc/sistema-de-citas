import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden } from "./http-error.js";

export async function loadEntitlements(request: FastifyRequest) {
  if (!request.tenantId) {
    return;
  }
  const items = await request.server.prisma.tenantEntitlement.findMany({
    where: { tenantId: request.tenantId }
  });
  request.entitlements = Object.fromEntries(items.map((item: { key: string; valueJson: unknown }) => [item.key, item.valueJson]));
}

export function requireFeature(key: string) {
  return async function featureGuard(request: FastifyRequest, _reply: FastifyReply) {
    const value = request.entitlements?.[key] as { enabled?: boolean } | undefined;
    if (value?.enabled === false) {
      throw forbidden(`Tu plan no tiene habilitado ${key}`, "FEATURE_DISABLED");
    }
  };
}
