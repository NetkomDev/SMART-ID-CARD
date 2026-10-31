import { describe, expect, it } from "vitest";
import {
  attendanceRulesUpdateSchema as rules,
  pwaAttendanceBatchSyncSchema as batch,
} from "./attendance.js";
describe("mobile attendance contracts", () => {
  it("accepts canonical admin fields and chronological ranges", () => {
    expect(
      rules.safeParse({
        check_in_start: "06:30",
        check_in_end: "07:30",
        check_out_start: "14:00",
      }).success,
    ).toBe(true);
  });
  it("rejects invalid clock values and reversed ranges", () => {
    for (const end of ["24:00", "07:60", "05:00", "15:00"])
      expect(
        rules.safeParse({
          check_in_start: "06:30",
          check_in_end: end,
          check_out_start: "14:00",
        }).success,
      ).toBe(false);
  });
  const scan = {
    event_id: "a0000000-0000-4000-8000-000000000001",
    device_id: "a0000000-0000-4000-8000-000000000002",
    identifier: "0012",
    direction: "CHECK_IN",
    occurred_at: "2026-10-31T07:30:00+08:00",
    scanner_name: "Pak A",
  };
  it("uses authenticated batch without printed token", () =>
    expect(batch.parse({ scans: [scan] }).scans[0].notes).toBe(""));
  it("bounds work and disallows client-assigned compliance", () => {
    expect(batch.safeParse({ scans: Array(51).fill(scan) }).success).toBe(
      false,
    );
    expect(
      batch.safeParse({ scans: [{ ...scan, is_late: false }] }).success,
    ).toBe(false);
  });
});
