import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { scopeOf } from "../../shared/tenant-scope.js";
import { issueAdminToken } from "../auth/auth.service.js";
import { loadUserAccess } from "../auth/access.js";
import { adminAccess } from "../auth/guards.js";
import { PERMISSIONS } from "../auth/permissions.js";
import { tenantOf } from "../tenancy/tenant-context.js";
import * as team from "./team.service.js";

const tags = ["equipo"];
const security = [{ bearerAuth: [] }];
const manage = adminAccess(PERMISSIONS.settingsManage);
const tokenSchema = z.string().min(20).max(200);

export async function teamRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const actorOf = (request: { auth?: { userId: string }; ip: string }) => ({
    userId: request.auth!.userId,
    ip: request.ip,
  });

  routes.get(
    "/team",
    { preHandler: manage, schema: { tags, security } },
    async (request) => team.listTeam(scopeOf(request)),
  );

  routes.post(
    "/team/invitations",
    {
      preHandler: manage,
      schema: {
        tags,
        security,
        body: z.object({ email: z.email(), role: z.string().min(2) }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await team.inviteMember(
            scopeOf(request),
            await tenantOf(request),
            request.body,
            actorOf(request),
          ),
        ),
  );

  routes.delete(
    "/team/invitations/:id",
    {
      preHandler: manage,
      schema: { tags, security, params: z.object({ id: z.uuid() }) },
    },
    async (request) =>
      team.revokeInvitation(
        scopeOf(request),
        request.params.id,
        actorOf(request),
      ),
  );

  routes.patch(
    "/team/members/:userId",
    {
      preHandler: manage,
      schema: {
        tags,
        security,
        params: z.object({ userId: z.uuid() }),
        body: z
          .object({
            role: z.string().min(2).optional(),
            active: z.boolean().optional(),
          })
          .refine(
            (body) => body.role !== undefined || body.active !== undefined,
            "Indica el rol o el estado",
          ),
      },
    },
    async (request) =>
      team.updateMember(
        scopeOf(request),
        request.params.userId,
        request.body,
        actorOf(request),
      ),
  );

  // Aceptar una invitacion es publico (llega por enlace): limite estricto por IP.
  await routes.register(async (invitations) => {
    await invitations.register(rateLimit, {
      max: 20,
      timeWindow: "15 minutes",
    });
    const publicRoutes = invitations.withTypeProvider<ZodTypeProvider>();

    publicRoutes.get(
      "/team/invitations/lookup",
      { schema: { tags, querystring: z.object({ token: tokenSchema }) } },
      async (request) =>
        team.describeInvitation(app.prisma, request.query.token),
    );

    publicRoutes.post(
      "/team/invitations/accept",
      {
        schema: {
          tags,
          summary: "Acepta una invitacion y devuelve una sesion del negocio",
          body: z.object({
            token: tokenSchema,
            password: z.string().min(1).max(128),
            fullName: z.string().trim().min(2).max(80).optional(),
          }),
        },
      },
      async (request) => {
        const { user, tenant } = await team.acceptInvitation(
          app.prisma,
          request.body,
          request.ip,
        );
        const access = await loadUserAccess(app.prisma, tenant.id, user.id);
        return {
          token: issueAdminToken(app.jwt, {
            userId: user.id,
            tenantId: tenant.id,
            email: user.email,
          }),
          user: {
            id: user.id,
            email: user.email,
            roles: access?.roles ?? [],
            permissions: access?.permissions ?? [],
          },
          tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        };
      },
    );
  });
}
