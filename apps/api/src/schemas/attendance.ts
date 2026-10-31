import { z } from "zod";

export const attendanceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(500).default(20),
    direction: z.enum(["CHECK_IN", "CHECK_OUT"]).optional(),
    occurred_from: z.iso.datetime({ offset: true }).optional(),
    occurred_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const attendanceRulesUpdateSchema = z
  .object({
    check_in_start: time,
    check_in_end: time,
    check_out_start: time,
  })
  .strict()
  .refine(
    (v) =>
      v.check_in_start <= v.check_in_end && v.check_in_end < v.check_out_start,
    { message: "Urutan jam datang dan pulang tidak valid" },
  );
export const attendanceBootstrapQuerySchema = z
  .object({ after: z.uuid().optional() })
  .strict();
export const pwaAttendanceScanSchema = z
  .object({
    event_id: z.uuid(),
    device_id: z.uuid(),
    identifier: z.string().trim().min(1).max(128),
    direction: z.enum(["CHECK_IN", "CHECK_OUT"]),
    occurred_at: z.iso.datetime({ offset: true }),
    notes: z.string().trim().max(500).default(""),
    scanner_name: z.string().trim().min(1).max(100),
  })
  .strict();
export const pwaAttendanceBatchSyncSchema = z
  .object({ scans: z.array(pwaAttendanceScanSchema).min(1).max(50) })
  .strict();
