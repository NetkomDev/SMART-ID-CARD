import { describe, expect, it } from "vitest";
import { canAccess } from "./permissions";

describe("admin route UX guards", () => {
  it("allows public-in-tenant routes without a UI permission", () => {
    expect(canAccess("/classes", [])).toBe(true);
  });

  it("requires the matching permission for protected modules", () => {
    expect(canAccess("/students", ["student.read"])).toBe(true);
    expect(canAccess("/students", ["device.read"])).toBe(false);
    expect(canAccess("/attendance", ["attendance.read"])).toBe(true);
    expect(canAccess("/cards", [])).toBe(false);
  });

  it("treats the guard as UX only by denying unknown permission state", () => {
    expect(canAccess("/devices", [])).toBe(false);
  });
});
