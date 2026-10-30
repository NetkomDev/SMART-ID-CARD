import { describe, expect, it } from "vitest";
import { safePortraitUrl } from "./portrait";
describe("untrusted portrait URLs", () => {
  it("rejects executable schemes and attribute breakout", () => {
    for (const value of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "x');\"><img src=x onerror=alert(1)>", "https://x.test/'><img>"]) expect(safePortraitUrl(value)).toBeNull();
  });
  it("accepts raster data and HTTPS URLs", () => {
    expect(safePortraitUrl("data:image/jpeg;base64,/9j/")).toBeTruthy();
    expect(safePortraitUrl("https://example.com/photo.jpg")).toBe("https://example.com/photo.jpg");
  });
});
