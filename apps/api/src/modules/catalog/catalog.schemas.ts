import { isWallTime, wallTimeToMinutes } from "@citas/shared/time";
import { z } from "zod";

const wallTime = z
  .string()
  .refine(isWallTime, "Usa el formato HH:mm (00:00 a 23:59)");

export const staffInputSchema = z.object({
  displayName: z.string().trim().min(2),
  phone: z.string().trim().optional(),
  commissionType: z.enum(["fixed", "percent"]).optional(),
  commissionValue: z.number().min(0).optional(),
  active: z.boolean().optional(),
});

const breakSchema = z
  .object({ start: wallTime, end: wallTime })
  .refine(
    (item) => wallTimeToMinutes(item.end) > wallTimeToMinutes(item.start),
    "El descanso debe terminar despues de empezar",
  );

export const scheduleSegmentSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: wallTime,
    endTime: wallTime,
    breakJson: z.array(breakSchema).optional(),
  })
  .refine(
    (segment) =>
      wallTimeToMinutes(segment.endTime) > wallTimeToMinutes(segment.startTime),
    "La jornada debe terminar despues de empezar",
  )
  .refine(
    (segment) =>
      (segment.breakJson ?? []).every(
        (item) =>
          wallTimeToMinutes(item.start) >=
            wallTimeToMinutes(segment.startTime) &&
          wallTimeToMinutes(item.end) <= wallTimeToMinutes(segment.endTime),
      ),
    "Los descansos deben estar dentro de la jornada",
  );

export const scheduleInputSchema = z.array(scheduleSegmentSchema).min(1);

export const serviceInputSchema = z.object({
  name: z.string().trim().min(2),
  durationMinutes: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0),
  active: z.boolean().optional(),
});

export type StaffInput = z.infer<typeof staffInputSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type ServiceInput = z.infer<typeof serviceInputSchema>;
