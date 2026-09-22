import { z } from "zod";

export const libraryVisitSchema = z.object({
  event_id: z.uuid(), card_uid: z.string().trim().min(4).max(64),
  occurred_at: z.iso.datetime({ offset: true }), local_sequence: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).strict();
export const libraryVisitBatchSchema = z.object({ events: z.array(libraryVisitSchema).min(1).max(500) }).strict();
export const librarySummaryQuerySchema = z.object({
  occurred_from: z.iso.datetime({ offset: true }).optional(), occurred_to: z.iso.datetime({ offset: true }).optional()
}).strict().refine((value) => !value.occurred_from || !value.occurred_to || new Date(value.occurred_to) >= new Date(value.occurred_from), {
  message: "occurred_to must not precede occurred_from", path: ["occurred_to"]
});
