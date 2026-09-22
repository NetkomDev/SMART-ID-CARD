import { z } from "zod";

export const gateAttendanceEventSchema = z.object({
  event_id: z.uuid(),
  card_uid: z.string().trim().min(1).max(64),
  occurred_at: z.iso.datetime({ offset: true }),
  local_sequence: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).default({})
}).strict();

export const gateAttendanceBatchSchema = z.object({
  events: z.array(gateAttendanceEventSchema).min(1).max(500)
}).strict().superRefine(({ events }, context) => {
  const eventIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (eventIds.has(event.event_id)) {
      context.addIssue({
        code: "custom",
        message: "event_id must be unique within a batch",
        path: ["events", index, "event_id"]
      });
    }
    eventIds.add(event.event_id);
  }
});
