import { describe, expect, it } from "vitest";
import { linkChildByNisnDobSchema } from "./parent.js";

describe("Parent self-service link by NISN and DOB contracts", () => {
  it("rejects invalid NISN or bad date format", () => {
    expect(linkChildByNisnDobSchema.safeParse({ nisn: "12", date_of_birth: "2010-05-15" }).success).toBe(false);
    expect(linkChildByNisnDobSchema.safeParse({ nisn: "0075849305", date_of_birth: "15-05-2010" }).success).toBe(false);
  });
  it("accepts valid NISN and ISO date", () => {
    expect(linkChildByNisnDobSchema.safeParse({ nisn: "0075849305", date_of_birth: "2010-05-15" }).success).toBe(true);
  });
});
