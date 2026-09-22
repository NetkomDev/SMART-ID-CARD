import { describe, expect, it } from "vitest";
import { gateAttendanceBatchSchema, gateAttendanceEventSchema } from "./gate-attendance.js";

const event = {
  event_id: "0199b4dc-3ea3-7d25-b493-0b998dbafabe",
  card_uid: "04AABBCCDD",
  occurred_at: "2026-09-22T06:30:00+07:00",
  local_sequence: 1
};

describe("Phase 06 gate attendance contracts", () => {
  it("accepts an offline-capable gate event and supplies metadata", () => {
    const parsed = gateAttendanceEventSchema.parse(event);
    expect(parsed.metadata).toEqual({});
  });

  it("rejects duplicate event IDs inside one sync batch", () => {
    const result = gateAttendanceBatchSchema.safeParse({ events: [event, { ...event, local_sequence: 2 }] });
    expect(result.success).toBe(false);
  });

  it("limits each offline sync batch to 500 events", () => {
    const events = Array.from({ length: 501 }, (_, index) => ({
      ...event,
      event_id: `0199b4dc-3ea3-7d25-b493-${index.toString().padStart(12, "0")}`,
      local_sequence: index
    }));
    expect(gateAttendanceBatchSchema.safeParse({ events }).success).toBe(false);
  });

  it("rejects negative local sequence numbers", () => {
    expect(gateAttendanceEventSchema.safeParse({ ...event, local_sequence: -1 }).success).toBe(false);
  });
});
