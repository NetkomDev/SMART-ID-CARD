import { describe, expect, it, vi } from "vitest";
import { ReadCache, cacheableRead } from "./read-cache";
describe("admin memory reads", () => {
  it("supports browsers without structuredClone", async () => {
    vi.stubGlobal("structuredClone", undefined);
    try {
      const cache = new ReadCache();
      const first = await cache.read("A", async () => ({ count: 2 }));
      first.count = 99;
      expect(await cache.read("A", async () => ({ count: 3 }))).toEqual({
        count: 2,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("combines concurrent reads and reuses fresh data without exposing mutable shared objects", async () => {
    const c = new ReadCache();
    let resolve!: (value: { count: number }) => void;
    const load = vi.fn(
      () => new Promise<{ count: number }>((r) => (resolve = r)),
    );
    const a = c.read("schoolA:students", load),
      b = c.read("schoolA:students", load);
    resolve({ count: 2 });
    const [one, two] = await Promise.all([a, b]);
    one.count = 20;
    expect(two.count).toBe(2);
    expect((await c.read("schoolA:students", load)).count).toBe(2);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("isolates schools and expires reads", async () => {
    let clock = 0;
    const c = new ReadCache(15, 40, () => clock),
      load = vi.fn(async () => 1);
    await c.read("A", load);
    await c.read("B", load);
    clock = 16;
    await c.read("A", load);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("does not repopulate invalidated cache with an old in-flight response", async () => {
    const c = new ReadCache();
    let resolve!: (n: number) => void;
    const old = c.read("A", () => new Promise<number>((r) => (resolve = r)));
    c.clear();
    expect(await c.read("A", async () => 2)).toBe(2);
    resolve(1);
    await old;
    expect(await c.read("A", async () => 3)).toBe(2);
  });
  it("never caches failures", async () => {
    const c = new ReadCache(),
      load = vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(2);
    await expect(c.read("A", load)).rejects.toThrow();
    expect(await c.read("A", load)).toBe(2);
  });
  it("bounds retained entries and skips large image payloads", async () => {
    const c = new ReadCache(1000, 1),
      load = vi.fn(async () => 1);
    await c.read("A", load);
    await c.read("B", load);
    await c.read("A", load);
    expect(load).toHaveBeenCalledTimes(3);
    const large = vi.fn(async () => "x".repeat(1_100_000));
    await c.read("photo", large);
    await c.read("photo", large);
    expect(large).toHaveBeenCalledTimes(2);
  });
  it("keeps live data, Auth and secret-bearing endpoints outside the cache", () => {
    for (const path of [
      "/attendance",
      "/dashboard/today",
      "/auth/session",
      "/parent/guardians",
      "/devices/pairing",
      "/reports/classes-summary",
    ])
      expect(cacheableRead(path)).toBe(false);
    for (const path of [
      "/students?page=1",
      "/classes/summary",
      "/cards/summary",
    ])
      expect(cacheableRead(path)).toBe(true);
  });
});
