import { z } from "zod";

export const attendanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  direction: z.enum(["CHECK_IN", "CHECK_OUT"]).optional(),
  occurred_from: z.iso.datetime({ offset: true }).optional(),
  occurred_to: z.iso.datetime({ offset: true }).optional()
}).strict();
