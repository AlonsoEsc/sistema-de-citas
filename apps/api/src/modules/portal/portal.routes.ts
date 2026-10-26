import { registerRateLimit } from "../../shared/rate-limit.js";
import { industryProfile } from "@citas/shared/industries";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { clearSessionCookie, setSessionCookie } from "../../shared/session.js";
import { scopeOf } from "../../shared/tenant-scope.js";
import { tenantOf } from "../tenancy/tenant-context.js";
import { ACTIVE_APPOINTMENT_STATUSES } from "../scheduling/availability.service.js";
import { getAvailability } from "../scheduling/availability.service.js";
import {
  cancelAppointmentByCustomer,
  createAppointment,
} from "../scheduling/appointment.service.js";
import { deleteCustomer } from "../customers/customers.service.js";
import { verifyOtp, startOtp } from "./otp.service.js";
import {
  requireBookingOpen,
  requirePortalCustomer,
  resolvePortalTenant,
} from "./portal-context.js";

const tags = ["portal"];
const security = [{ bearerAuth: [] }];
const tenantParams = z.object({ tenantSlug: z.string().min(2).max(80) });

// Respuestas publicas: solo los campos que el cliente necesita ver.
const publicServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  durationMinutes: z.number(),
  priceCents: z.number(),
});
const publicStaffSchema = z.object({ id: z.string(), displayName: z.string() });
const slotSchema = z.object({ startAt: z.string(), endAt: z.string() });

const customerAppointmentSchema = z.object({
  id: z.string(),
  status: z.string(),
  startAt: z.date(),
  endAt: z.date(),
  priceCents: z.number(),
  currency: z.string(),
  staff: publicStaffSchema,
  services: z.array(z.object({ service: publicServiceSchema })),
});

/** Portal de reservas: `/public/:tenantSlug/*`. El negocio se resuelve por slug. */
export async function portalRoutes(app: FastifyInstance) {
  // Verificacion de telefono: limite estricto por IP (y por telefono dentro del servicio).
  await app.register(
    async (auth) => {
      await registerRateLimit(auth, "portal-otp", {
        max: 20,
        timeWindow: "15 minutes",
      });
      auth.addHook("preHandler", resolvePortalTenant);
      const routes = auth.withTypeProvider<ZodTypeProvider>();

      routes.post(
        "/auth/start",
        {
          preHandler: [requireBookingOpen],
          config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
          schema: {
            tags,
            summary: "Envia un codigo de verificacion al telefono del cliente",
            params: tenantParams,
            body: z.object({
              provider: z
                .enum(["manual", "google", "facebook"])
                .default("manual"),
              fullName: z.string().trim().min(2).optional(),
              email: z.email().optional(),
              phone: z.string().min(7),
              googleIdToken: z.string().optional(),
              facebookAccessToken: z.string().optional(),
            }),
          },
        },
        async (request) =>
          startOtp(scopeOf(request), request.body, {
            userAgent: request.headers["user-agent"] ?? "unknown",
          }),
      );

      routes.post(
        "/auth/verify",
        {
          schema: {
            tags,
            params: tenantParams,
            body: z.object({
              sessionId: z.uuid(),
              code: z.string().regex(/^\d{6}$/),
            }),
          },
        },
        async (request, reply) => {
          const session = await verifyOtp(
            scopeOf(request),
            app.jwt,
            request.body,
          );
          setSessionCookie(
            request,
            reply,
            "booking",
            session.token,
            request.params.tenantSlug,
          );
          return session;
        },
      );

      routes.post(
        "/auth/logout",
        { schema: { tags, params: tenantParams } },
        async (request, reply) => {
          clearSessionCookie(reply, "booking", request.params.tenantSlug);
          return { ok: true as const };
        },
      );

      routes.patch(
        "/me",
        {
          preHandler: [requirePortalCustomer],
          schema: {
            tags,
            security,
            params: tenantParams,
            summary: "El cliente actualiza su nombre",
            body: z.object({ fullName: z.string().trim().min(2).max(80) }),
          },
        },
        async (request) => {
          const customer = await scopeOf(request).db.customer.update({
            where: { id: request.customerAuth!.customerId },
            data: { fullName: request.body.fullName },
          });
          return { id: customer.id, fullName: customer.fullName };
        },
      );

      // Derecho de supresion: el cliente borra sus datos sin depender del negocio.
      routes.post(
        "/me/delete",
        {
          preHandler: [requirePortalCustomer],
          schema: {
            tags,
            security,
            params: tenantParams,
            summary: "El cliente elimina sus datos personales de este negocio",
          },
        },
        async (request) => {
          const result = await deleteCustomer(
            scopeOf(request),
            request.customerAuth!.customerId,
            null,
          );
          return { ok: true as const, anonymized: result.anonymized };
        },
      );
    },
    { prefix: "/public/:tenantSlug" },
  );

  await app.register(
    async (portal) => {
      await registerRateLimit(portal, "portal", {
        max: 100,
        timeWindow: "1 minute",
      });
      portal.addHook("preHandler", resolvePortalTenant);
      const routes = portal.withTypeProvider<ZodTypeProvider>();

      routes.get(
        "/profile",
        {
          schema: {
            tags,
            summary: "Datos publicos del negocio para el portal de reservas",
            params: tenantParams,
            response: {
              200: z.object({
                name: z.string(),
                slug: z.string(),
                industry: z.string(),
                vocabulary: z.object({
                  customer: z.tuple([z.string(), z.string()]),
                  staff: z.tuple([z.string(), z.string()]),
                  service: z.tuple([z.string(), z.string()]),
                  appointment: z.tuple([z.string(), z.string()]),
                }),
                timezone: z.string(),
                currency: z.string(),
                locale: z.string(),
                bookingWindowDays: z.number(),
                bookingOpen: z.boolean(),
              }),
            },
          },
        },
        async (request) => {
          const tenant = await tenantOf(request);
          return {
            name: tenant.name,
            slug: tenant.slug,
            industry: tenant.industry,
            vocabulary: industryProfile(tenant.industry).vocabulary,
            timezone: tenant.timezone,
            currency: tenant.currency,
            locale: tenant.locale,
            bookingWindowDays: tenant.bookingWindowDays,
            bookingOpen: tenant.access === "full",
          };
        },
      );

      routes.get(
        "/services",
        {
          schema: {
            tags,
            params: tenantParams,
            response: { 200: z.array(publicServiceSchema) },
          },
        },
        async (request) =>
          scopeOf(request).db.service.findMany({
            where: { active: true },
            orderBy: { name: "asc" },
          }),
      );

      routes.get(
        "/staff",
        {
          schema: {
            tags,
            params: tenantParams,
            response: { 200: z.array(publicStaffSchema) },
          },
        },
        async (request) =>
          scopeOf(request).db.staff.findMany({
            where: { active: true },
            orderBy: { displayName: "asc" },
          }),
      );

      routes.get(
        "/availability",
        {
          schema: {
            tags,
            params: tenantParams,
            querystring: z.object({
              date: z.string(),
              staffId: z.uuid().optional(),
              serviceIds: z
                .string()
                .transform((value) => value.split(",").filter(Boolean))
                .pipe(z.array(z.uuid()).min(1)),
            }),
            response: {
              200: z.object({
                tenant: z.object({
                  id: z.string(),
                  slug: z.string(),
                  name: z.string(),
                }),
                durationMinutes: z.number(),
                data: z.array(
                  z.object({
                    staffId: z.string(),
                    displayName: z.string(),
                    slots: z.array(slotSchema),
                  }),
                ),
              }),
            },
          },
        },
        async (request) => {
          const tenant = await tenantOf(request);
          const availability = await getAvailability(scopeOf(request), tenant, {
            date: request.query.date,
            serviceIds: request.query.serviceIds,
            staffId: request.query.staffId,
          });
          return {
            tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
            durationMinutes: availability.durationMinutes,
            data: availability.staff,
          };
        },
      );

      routes.post(
        "/book",
        {
          preHandler: [requirePortalCustomer, requireBookingOpen],
          schema: {
            tags,
            security,
            params: tenantParams,
            body: z.object({
              staffId: z.uuid(),
              serviceIds: z.array(z.uuid()).min(1),
              startAt: z.iso.datetime({ offset: true }),
            }),
            response: { 200: customerAppointmentSchema },
          },
        },
        async (request) =>
          createAppointment(scopeOf(request), await tenantOf(request), {
            source: "portal",
            actor: "customer",
            enforceSingleActiveByPhone: true,
            staffId: request.body.staffId,
            serviceIds: request.body.serviceIds,
            startAt: new Date(request.body.startAt),
            customerId: request.customerAuth!.customerId,
          }),
      );

      routes.get(
        "/my-appointments",
        {
          preHandler: [requirePortalCustomer],
          schema: {
            tags,
            security,
            params: tenantParams,
            response: { 200: z.array(customerAppointmentSchema) },
          },
        },
        async (request) =>
          scopeOf(request).db.appointment.findMany({
            where: {
              customerId: request.customerAuth!.customerId,
              status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
              endAt: { gt: new Date() },
            },
            include: { staff: true, services: { include: { service: true } } },
            orderBy: { startAt: "asc" },
          }),
      );

      routes.post(
        "/cancel",
        {
          preHandler: [requirePortalCustomer],
          schema: {
            tags,
            security,
            params: tenantParams,
            body: z.object({ appointmentId: z.uuid() }),
          },
        },
        async (request) => {
          const appointment = await cancelAppointmentByCustomer(
            scopeOf(request),
            await tenantOf(request),
            {
              appointmentId: request.body.appointmentId,
              customerId: request.customerAuth!.customerId,
            },
          );
          return {
            ok: true as const,
            appointment: { id: appointment.id, status: appointment.status },
          };
        },
      );
    },
    { prefix: "/public/:tenantSlug" },
  );
}
