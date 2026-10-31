import { afterEach, describe, it, expect, vi } from "vitest";
import { QRCamera, scanBox, portalQRLink, cameraError } from "./qr-camera";
afterEach(() => vi.unstubAllGlobals());
describe("QR camera lifecycle and geometry", () => {
  it.each([
    [240, 180],
    [320, 320],
    [200, 80],
    [800, 600],
  ])("keeps scan box inside %sx%s viewport", (w, h) => {
    const box = scanBox(w, h);
    expect(box.width).toBeLessThanOrEqual(Math.min(w, h, 240));
    expect(box.height).toBe(box.width);
  });
  it("stops a stream whose permission resolves after cancellation", async () => {
    let allow!: () => void;
    const stop = vi.fn(async () => {}),
      start = vi.fn(() => new Promise<void>((r) => (allow = r)));
    const camera = new QRCamera({
      readerId: "test",
      onDecode: vi.fn(),
      factory: async () => ({ start, stop }),
    });
    const opening = camera.start();
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    const closing = camera.stop();
    allow();
    await Promise.all([opening, closing]);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(camera.active).toBe(false);
  });
  it("delivers a QR once and stops before submitting a one-shot scan", async () => {
    let decode!: (value: string) => void;
    const stop = vi.fn(async () => {}),
      submit = vi.fn(async () => {
        expect(stop).toHaveBeenCalledTimes(1);
      });
    const camera = new QRCamera({
      readerId: "test",
      once: true,
      onDecode: submit,
      factory: async () => ({
        start: vi.fn(async (_camera, _config, success) => {
          decode = success as any;
        }),
        stop,
      }),
    });
    await camera.start();
    decode("card-a");
    decode("card-a");
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(camera.active).toBe(false);
  });
  it("handles denied permission without leaving a running camera", async () => {
    const phases: string[] = [];
    const camera = new QRCamera({
      readerId: "test",
      onDecode: vi.fn(),
      onState: (phase) => phases.push(phase),
      factory: async () => ({
        start: vi.fn(async () => {
          throw Object.assign(new Error("Denied"), { name: "NotAllowedError" });
        }),
        stop: vi.fn(),
      }),
    });
    await camera.start();
    expect(camera.active).toBe(false);
    expect(phases.at(-1)).toBe("error");
    expect(cameraError({ name: "NotAllowedError" })).toContain("Izin kamera");
  });
  it("rejects foreign sites, wrong portals and malformed access tokens", () => {
    vi.stubGlobal("location", { href: "https://www.aksis.co.id/waste/" });
    const token = "a".repeat(64);
    expect(
      portalQRLink(`https://www.aksis.co.id/waste/#token=${token}`, "/waste/"),
    ).toContain(token);
    for (const link of [
      `https://evil.example/waste/#token=${token}`,
      `https://www.aksis.co.id/library/#token=${token}`,
      "https://www.aksis.co.id/waste/#token=bad",
    ])
      expect(portalQRLink(link, "/waste/")).toBeNull();
  });
});
