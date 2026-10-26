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

export const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Zona horaria invalida");

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(
    (value) => Intl.supportedValuesOf("currency").includes(value),
    "Moneda invalida",
  );

/** Politica de contrasenas del panel: minimo 10 caracteres con letras y numeros. */
export const passwordSchema = z
  .string()
  .min(10, "Minimo 10 caracteres")
  .max(128)
  .refine(
    (value) => /[a-zA-Z]/.test(value) && /\d/.test(value),
    "Debe incluir letras y numeros",
  );
