import { normalizePhone } from "@citas/shared/phone";
import { z } from "zod";

export const idParamsSchema = z.object({ id: z.uuid() });

export const okResponseSchema = z.object({ ok: z.literal(true) });

/** Telefono opcional normalizado a "+digitos"; un texto vacio cuenta como ausente. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .transform((value) => (value ? normalizePhone(value) : undefined))
  .refine(
    (value) => value === undefined || value.length >= 8,
    "Telefono invalido",
  )
  .optional();
