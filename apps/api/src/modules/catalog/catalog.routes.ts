import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { idParamsSchema } from "../../shared/schemas.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import {
  scheduleInputSchema,
  serviceInputSchema,
  staffInputSchema,
} from "./catalog.schemas.js";
import * as catalog from "./catalog.service.js";
import { tenantOf } from "../tenancy/tenant-context.js";

const security = [{ bearerAuth: [] }];

export async function catalogRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  const staffTags = ["profesionales"];
  routes.get(
    "/staff",
    { preHandler: adminAccess(), schema: { tags: staffTags, security } },
    async (request) => catalog.listStaff(scopeOf(request)),
  );
  routes.post(
    "/staff",
    {
      preHandler: adminAccess(PERMISSIONS.staffManage),
      schema: { tags: staffTags, security, body: staffInputSchema },
    },
    async (request) =>
      catalog.createStaff(
        scopeOf(request),
        await tenantOf(request),
        request.body,
      ),
  );
  routes.patch(
    "/staff/:id",
    {
      preHandler: adminAccess(PERMISSIONS.staffManage),
      schema: {
        tags: staffTags,
        security,
        params: idParamsSchema,
        body: staffInputSchema.partial(),
      },
    },
    async (request) =>
      catalog.updateStaff(
        scopeOf(request),
        await tenantOf(request),
        request.params.id,
        request.body,
      ),
  );
  routes.get(
    "/staff/:id/schedule",
    {
      preHandler: adminAccess(),
      schema: { tags: staffTags, security, params: idParamsSchema },
    },
    async (request) =>
      catalog.getStaffSchedule(scopeOf(request), request.params.id),
  );
  routes.put(
    "/staff/:id/schedule",
    {
      preHandler: adminAccess(PERMISSIONS.staffManage),
      schema: {
        tags: staffTags,
        security,
        params: idParamsSchema,
        body: scheduleInputSchema,
      },
    },
    async (request) =>
      catalog.replaceStaffSchedule(
        scopeOf(request),
        request.params.id,
        request.body,
      ),
  );

  const serviceTags = ["servicios"];
  routes.get(
    "/services",
    { preHandler: adminAccess(), schema: { tags: serviceTags, security } },
    async (request) => catalog.listServices(scopeOf(request)),
  );
  routes.post(
    "/services",
    {
      preHandler: adminAccess(PERMISSIONS.servicesManage),
      schema: { tags: serviceTags, security, body: serviceInputSchema },
    },
    async (request) => catalog.createService(scopeOf(request), request.body),
  );
  routes.patch(
    "/services/:id",
    {
      preHandler: adminAccess(PERMISSIONS.servicesManage),
      schema: {
        tags: serviceTags,
        security,
        params: idParamsSchema,
        body: serviceInputSchema.partial(),
      },
    },
    async (request) =>
      catalog.updateService(scopeOf(request), request.params.id, request.body),
  );
}
