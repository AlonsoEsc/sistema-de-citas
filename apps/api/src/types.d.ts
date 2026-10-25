import { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    auth?: {
      userId: string;
      tenantId: string;
      email: string;
      roles: string[];
      permissions: string[];
    };
    customerAuth?: {
      customerId: string;
      tenantId: string;
      phone?: string;
      email?: string;
      type: "booking_customer";
    };
    tenantId?: string;
    entitlements?: Record<string, unknown>;
  }

  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export {};
