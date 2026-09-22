import { z } from "zod";

export const createExtracurricularSchema = z.object({
  code: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional()
}).strict();

export const updateExtracurricularSchema = createExtracurricularSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required"
);

export const createSessionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true })
}).strict().refine((value) => new Date(value.ends_at) > new Date(value.starts_at), {
  message: "ends_at must be after starts_at",
  path: ["ends_at"]
});

export const fastEnrollmentSchema = z.object({
  student_id: z.uuid(),
  idempotency_key: z.uuid(),
  confirmed: z.literal(true)
}).strict();

export const recordAttendanceSchema = z.object({
  student_id: z.uuid(),
  status: z.enum(["PRESENT", "EXCUSED", "ABSENT"]),
  notes: z.string().trim().max(500).nullable().optional()
}).strict();

export const sessionParamsSchema = z.object({ id: z.uuid(), sessionId: z.uuid() }).strict();
