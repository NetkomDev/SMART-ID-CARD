import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { dataUrlToBuffer, processStudentPhotoWorker } from "./photo-processor.js";

describe("validated photo pipeline", () => {
  it("rejects markup, URLs, SVG, MIME mismatch and broken base64", () => {
    for (const value of ["'><img src=x onerror=alert(1)>", "https://example.com/photo.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,YWJj", "data:image/png;base64,!!!!"]) {
      expect(() => dataUrlToBuffer(value)).toThrow();
    }
  });
  it("rejects oversized payloads before decoding", () => {
    expect(() => dataUrlToBuffer("data:image/jpeg;base64," + "A".repeat(2_800_000))).toThrow("maksimal");
  });
  it("re-encodes a valid image to a metadata-free 900x1200 JPEG", async () => {
    const input = await sharp({ create: { width: 30, height: 40, channels: 3, background: "white" } }).png().toBuffer();
    const result = await processStudentPhotoWorker(`data:image/png;base64,${input.toString("base64")}`);
    const metadata = await sharp(dataUrlToBuffer(result.dataUrl)).metadata();
    expect(metadata.format).toBe("jpeg");
    expect([metadata.width, metadata.height]).toEqual([900, 1200]);
    expect(metadata.exif).toBeUndefined();
  });
  it("never returns invalid original data on decoder failure", async () => {
    await expect(processStudentPhotoWorker("data:image/png;base64,iVBORw0KGgo=")).rejects.toThrow("Foto");
  });
});
