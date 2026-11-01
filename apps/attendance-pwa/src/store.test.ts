import { describe, it, expect } from "vitest";
import {
  newEventId,
  schoolTime,
  compliance,
  attendanceGreeting,
  resolveStudent,
  payload,
  type Student,
  type Record,
} from "./store";
const rules = {
  check_in_start: "06:30",
  check_in_end: "07:30",
  check_out_start: "14:00",
  timezone: "Asia/Makassar",
};
describe("mobile attendance day and identity", () => {
  it("uses school date before 08:00 WITA despite previous UTC date", () =>
    expect(schoolTime("2026-10-30T23:30:00Z", rules.timezone)).toEqual({
      day: "2026-10-31",
      time: "07:30",
    }));
  it("keeps the whole cutoff minute on time", () => {
    expect(compliance("CHECK_IN", "2026-10-30T23:30:59Z", rules).is_late).toBe(
      false,
    );
    expect(compliance("CHECK_IN", "2026-10-30T23:31:00Z", rules).is_late).toBe(
      true,
    );
  });
  it("formats contextual voice greeting based on direction and punctuality", () => {
    expect(attendanceGreeting("Ahmad", "CHECK_IN", false)).toBe("Selamat Pagi Ahmad");
    expect(attendanceGreeting("Ahmad", "CHECK_IN", true)).toBe("Waduh kamu terlambat hari ini Ahmad");
    expect(attendanceGreeting("Ahmad", "CHECK_OUT", false)).toBe("Sampai Jumpa besok Ahmad. Hati-hati dijalan.");
    expect(attendanceGreeting("Ahmad", "CHECK_OUT", true)).toBe("Sampai Jumpa besok Ahmad. Hati-hati dijalan.");
  });
  it("marks departure before official time as early", () => {
    expect(
      compliance("CHECK_OUT", "2026-10-31T05:59:59Z", rules).is_early_departure,
    ).toBe(true);
    expect(
      compliance("CHECK_OUT", "2026-10-31T06:00:00Z", rules).is_early_departure,
    ).toBe(false);
  });
  const s: Student = {
    id: "a",
    full_name: "A",
    student_number: "12",
    nisn: "0012",
    cards: [
      {
        qr_key: "abc",
        card_uid: "FF",
        card_serial: "S",
        expires_at: "2026-11-01T00:00:00Z",
      },
    ],
  };
  it("resolves all card aliases to the same student", () => {
    for (const id of ["a", "12", "0012", "ABC", "ff", "S"])
      expect(resolveStudent([s], id, "2026-10-31T00:00:00Z")?.id).toBe("a");
  });
  it("rejects expired cards and ambiguous IDs", () => {
    expect(resolveStudent([s], "ABC", "2026-11-02T00:00:00Z")).toBeUndefined();
    expect(
      resolveStudent([s, { ...s, id: "b" }], "0012", "2026-10-31T00:00:00Z"),
    ).toBeUndefined();
  });
  it("sends only the server contract, no local success flags or portal token", () => {
    const v = {
      event_id: "e",
      device_id: "d",
      identifier: "12",
      direction: "CHECK_IN",
      occurred_at: "t",
      notes: "",
      scanner_name: "G",
      scope: "s",
      status: "PENDING",
      student_id: "a",
      is_late: false,
    } as Record;
    expect(Object.keys(payload(v)).sort()).toEqual([
      "device_id",
      "direction",
      "event_id",
      "identifier",
      "notes",
      "occurred_at",
      "scanner_name",
    ]);
  });
});

describe("UUID support on older browsers", () => {
  it("creates valid distinct UUIDs without randomUUID", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    try {
      const first = newEventId(),
        second = newEventId();
      expect(first).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(second).not.toBe(first);
    } finally {
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        value: original,
      });
    }
  });
});
