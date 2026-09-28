import { describe, expect, it } from "vitest";
import { qrGenerateSchema, qrLoginSchema } from "./portal.js";
const id = "10000000-0000-4000-8000-000000000001";
describe("QR portal contracts", () => {
  it("rejects administrative role issuance", () => {
    expect(qrGenerateSchema.safeParse({ school_id: id, role_code: "SUPER_ADMIN" }).success).toBe(false);
    expect(qrGenerateSchema.safeParse({ school_id: id, role_code: "SCHOOL_ADMIN" }).success).toBe(false);
  });
  it("requires class/child scope and forbids unrelated scope", () => {
    expect(qrGenerateSchema.safeParse({ school_id: id, role_code: "WASTE_STAFF" }).success).toBe(false);
    expect(qrGenerateSchema.safeParse({ school_id: id, role_code: "PARENT" }).success).toBe(true);
    expect(qrGenerateSchema.safeParse({ school_id: id, role_code: "LIBRARY_STAFF", metadata: { class_id: id } }).success).toBe(false);
    expect(qrGenerateSchema.safeParse({ school_id: id, role_code: "WASTE_STAFF", metadata: { class_id: id } }).success).toBe(true);
  });
  it("binds login to its destination portal", () => {
    expect(qrLoginSchema.safeParse({ token: "a".repeat(64) }).success).toBe(false);
    expect(qrLoginSchema.safeParse({ token: "a".repeat(64), role_code: "PARENT" }).success).toBe(true);
  });
});
