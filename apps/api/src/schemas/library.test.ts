import { describe, expect, it } from "vitest";
import { librarySummaryQuerySchema, libraryVisitBatchSchema, libraryVisitSchema } from "./library.js";
const event = { event_id: "0199b4dc-3ea3-7d25-b493-0b998dbafabe", card_uid: "04AABBCC", occurred_at: "2026-09-23T08:00:00+07:00", local_sequence: 1 };
describe("library contracts", () => {
  it("accepts an offline-capable visit event", () => expect(libraryVisitSchema.safeParse(event).success).toBe(true));
  it("limits a sync batch to 500 events", () => expect(libraryVisitBatchSchema.safeParse({ events: Array(501).fill(event) }).success).toBe(false));
  it("rejects a reversed summary interval", () => expect(librarySummaryQuerySchema.safeParse({ occurred_from: "2026-09-24T00:00:00Z", occurred_to: "2026-09-23T00:00:00Z" }).success).toBe(false));
});
