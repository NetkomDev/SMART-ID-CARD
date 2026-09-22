import { describe, expect, it } from "vitest";
import { claimParentLinkSchema, createParentTokenSchema } from "./parent.js";

describe("Phase 08 parent access contracts", () => {
  it("rejects short link tokens", () => expect(claimParentLinkSchema.safeParse({ token: "short", full_name: "Ibu Andi" }).success).toBe(false));
  it("bounds token validity", () => expect(createParentTokenSchema.safeParse({ student_id: "0199b4dc-3ea3-7d25-b493-0b998dbafabe", relationship: "MOTHER", expires_in_hours: 200 }).success).toBe(false));
});
