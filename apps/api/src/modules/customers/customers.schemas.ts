import { z } from "zod";
import { optionalPhoneSchema } from "../../shared/schemas.js";

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: optionalPhoneSchema,
  email: z.email().optional(),
  notes: z.string().max(1000).optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
