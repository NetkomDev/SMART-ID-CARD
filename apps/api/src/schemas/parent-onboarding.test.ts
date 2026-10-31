import { describe, expect, it } from "vitest";
import { normalizeWhatsApp, parentEnrollmentSchema, parentRecoverySchema } from "./parent-onboarding.js";
const fixture = { token: "a".repeat(64), nisn: "0012345678", date_of_birth: "2010-01-02", full_name: "Wali Siswa", phone: "0812 3456-7890" };
describe("parent QR onboarding input", () => {
  it.each(["081234567890", "6281234567890", "+62 (812) 3456-7890"])("normalizes %s to one guardian ID", value => expect(normalizeWhatsApp(value)).toBe("+6281234567890"));
  it.each(["0812abc56789", "+18001234567", "02112345678", "0812", "081234567890123456"])("rejects malformed WA %s", value => expect(() => normalizeWhatsApp(value)).toThrow());
  it("preserves NISN leading zeros and never accepts email/password or school overrides", () => {
    expect(parentEnrollmentSchema.parse(fixture)).toMatchObject({ nisn: "0012345678", phone: "+6281234567890" });
    expect(parentEnrollmentSchema.safeParse({ ...fixture, school_id: "other" }).success).toBe(false);
    expect(parentEnrollmentSchema.safeParse({ email: "x@y.co", password: "pass" }).success).toBe(false);
  });
  it("rejects impossible DOB and invalid QR", () => {
    expect(parentEnrollmentSchema.safeParse({ ...fixture, date_of_birth: "2010-02-30" }).success).toBe(false);
    expect(parentRecoverySchema.safeParse({ token: "short" }).success).toBe(false);
  });
});
