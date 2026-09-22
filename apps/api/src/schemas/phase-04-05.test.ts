import { describe, expect, it } from "vitest";
import { createAcademicYearSchema } from "./academic-year.js";
import { createCardSchema } from "./card.js";
import { heartbeatSchema, registerDeviceSchema } from "./device.js";

describe("Phase 04 and 05 request contracts", () => {
  it("rejects an academic year with an inverted date range", () => {
    const result = createAcademicYearSchema.safeParse({
      name: "2027/2028",
      start_date: "2028-07-01",
      end_date: "2027-06-30"
    });
    expect(result.success).toBe(false);
  });

  it("requires opaque card QR keys with sufficient entropy", () => {
    const result = createCardSchema.safeParse({
      student_id: "0199b4dc-3ea3-7d25-b493-0b998dbafabe",
      card_uid: "04AABBCCDD",
      card_serial: "CARD-1",
      qr_key: "short"
    });
    expect(result.success).toBe(false);
  });

  it("applies safe defaults to device registration", () => {
    const result = registerDeviceSchema.parse({
      device_code: "GATE-001",
      device_type: "GATE",
      name: "Main gate"
    });
    expect(result.update_channel).toBe("stable");
    expect(result.config).toEqual({});
  });

  it("bounds heartbeat signal strength", () => {
    const result = heartbeatSchema.safeParse({
      uptime_seconds: 60,
      signal_strength: 10,
      firmware_version: "1.0.0",
      reported_at: "2026-09-21T12:00:00Z"
    });
    expect(result.success).toBe(false);
  });
});
