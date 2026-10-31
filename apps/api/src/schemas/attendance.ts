import { z } from "zod";

export const attendanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(20),
  direction: z.enum(["CHECK_IN", "CHECK_OUT"]).optional(),
  occurred_from: z.iso.datetime({ offset: true }).optional(),
  occurred_to: z.iso.datetime({ offset: true }).optional()
}).strict();

export const attendanceRulesUpdateSchema = z.object({
  entry_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Format jam harus HH:MM atau HH:MM:SS"),
  on_time_until: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Format jam harus HH:MM atau HH:MM:SS"),
  checkout_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Format jam harus HH:MM atau HH:MM:SS")
}).strict();

export const pwaAttendanceScanSchema = z.object({
  token: z.string().min(32).max(128),
  event_id: z.string().uuid(),
  identifier: z.string().trim().min(1).max(200),
  direction: z.enum(["CHECK_IN", "CHECK_OUT"]),
  occurred_at: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(500).optional().default(""),
  scanner_name: z.string().trim().max(100).optional().default("")
}).strict();

export const pwaAttendanceBatchSyncSchema = z.object({
  token: z.string().min(32).max(128),
  scans: z.array(z.object({
    event_id: z.string().uuid(),
    identifier: z.string().trim().min(1).max(200),
    direction: z.enum(["CHECK_IN", "CHECK_OUT"]),
    occurred_at: z.string().datetime({ offset: true }),
    notes: z.string().trim().max(500).optional().default(""),
    scanner_name: z.string().trim().max(100).optional().default("")
  })).min(1).max(1000)
}).strict();
