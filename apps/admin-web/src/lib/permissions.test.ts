import { describe, expect, it } from "vitest";
import { canAccess } from "./permissions";

describe("admin route UX guards", () => {
  it("keeps Super Admin exclusively in the platform even with a school role", () => {
    for (const path of ["/", "/students", "/devices", "/cards", "/pwa-portals"]) {
      expect(canAccess(path, ["card.read"], ["SUPER_ADMIN", "SCHOOL_ADMIN"])).toBe(false);
    }
    expect(canAccess("/platform-card-jobs", [], ["SUPER_ADMIN"])).toBe(true);
  });

  it("denies school administrators access to card production and every platform menu", () => {
    for (const path of ["/platform", "/platform-schools", "/platform-card-jobs", "/platform-iam", "/platform-audit"]) {
      expect(canAccess(path, ["card.write", "card.manage"], ["SCHOOL_ADMIN"])).toBe(false);
    }
    expect(canAccess("/cards", [], ["SCHOOL_ADMIN"])).toBe(true);
  });
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
