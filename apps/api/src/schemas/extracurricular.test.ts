import { describe, expect, it } from "vitest";
import { createSessionSchema, fastEnrollmentSchema, recordAttendanceSchema } from "./extracurricular.js";

const id = "0199b4dc-3ea3-7d25-b493-0b998dbafabe";

describe("extracurricular contracts", () => {
  it("requires explicit confirmation for fast enrollment", () => {
    expect(fastEnrollmentSchema.safeParse({ student_id: id, idempotency_key: id, confirmed: false }).success).toBe(false);
    expect(fastEnrollmentSchema.safeParse({ student_id: id, idempotency_key: id, confirmed: true }).success).toBe(true);
  });

  it("rejects an invalid session interval", () => {
    expect(createSessionSchema.safeParse({ name: "Latihan", starts_at: "2026-09-22T09:00:00Z", ends_at: "2026-09-22T08:00:00Z" }).success).toBe(false);
  });

  it.each(["PRESENT", "EXCUSED", "ABSENT"])("accepts %s attendance", (status) => {
    expect(recordAttendanceSchema.safeParse({ student_id: id, status }).success).toBe(true);
  });
});
