import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
let api: typeof import("./api").api;
let session: typeof import("./session");
const json = (data: unknown, status = 200) =>
  new Response(
    JSON.stringify(
      status < 400
        ? { success: true, data }
        : {
            success: false,
            error: { code: "AUTH_INVALID", message: "expired" },
          },
    ),
    { status, headers: { "content-type": "application/json" } },
  );
beforeEach(async () => {
  vi.resetModules();
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    removeItem: (k: string) => data.delete(k),
  });
  vi.stubGlobal("location", { pathname: "/students" });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
  session = await import("./session");
  session.setSession({ access_token: "old", refresh_token: "refresh-old" });
  session.setSchoolId("A");
  api = (await import("./api")).api;
});
afterEach(() => vi.unstubAllGlobals());
describe("admin API request lifecycle", () => {
  it("deduplicates requests and invalidates data after mutations", async () => {
    const fetch = vi.fn(async () => json([{ id: 1 }]));
    vi.stubGlobal("fetch", fetch);
    await Promise.all([api("/students?page=1"), api("/students?page=1")]);
    await api("/students?page=1");
    expect(fetch).toHaveBeenCalledTimes(1);
    await api("/students", { method: "PATCH", body: "{}" });
    await api("/students?page=1");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not reuse one tenant or account cache for another", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json([]),
    );
    vi.stubGlobal("fetch", fetch);
    await api("/classes/summary");
    session.setSchoolId("B");
    await api("/classes/summary");
    session.setSession({
      access_token: "other",
      refresh_token: "other-refresh",
    });
    await api("/classes/summary");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      new Headers(fetch.mock.calls[1]![1]?.headers).get("x-school-id"),
    ).toBe("B");
    expect(
      new Headers(fetch.mock.calls[2]![1]?.headers).get("authorization"),
    ).toBe("Bearer other");
  });
  it("always requests live data and supports explicit no-store", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json([]),
    );
    vi.stubGlobal("fetch", fetch);
    await api("/dashboard/today");
    await api("/dashboard/today");
    await api("/classes/summary", { cache: "no-store" });
    await api("/classes/summary", { cache: "no-store" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("combines concurrent refreshes and retries each request with the new token", async () => {
    let refreshes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/auth/refresh")) {
          refreshes++;
          await new Promise((r) => setTimeout(r, 20));
          return json({
            access_token: "fresh",
            refresh_token: "refresh-fresh",
          });
        }
        return new Headers(init.headers).get("authorization") === "Bearer fresh"
          ? json([])
          : json(null, 401);
      }),
    );
    await Promise.all([api("/students?search=A"), api("/students?search=B")]);
    expect(refreshes).toBe(1);
    expect(session.getSession()?.access_token).toBe("fresh");
  });
  it("never restores an old account after logout/login during a refresh", async () => {
    let resolve!: (r: Response) => void;
    let started!: () => void;
    const ready = new Promise<void>((r) => (started = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/auth/refresh")) {
          started();
          return new Promise<Response>((r) => (resolve = r));
        }
        return json(null, 401);
      }),
    );
    const request = api("/students");
    await ready;
    session.clearSession();
    session.setSession({
      access_token: "new-login",
      refresh_token: "new-refresh",
    });
    resolve(
      json({ access_token: "old-refreshed", refresh_token: "old-rotated" }),
    );
    await expect(request).rejects.toMatchObject({
      code: "NAVIGATION_CANCELLED",
    });
    expect(session.getSession()?.access_token).toBe("new-login");
  });
  it("drops a result from a route that is no longer active", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>((r) => (resolve = r)));
    const request = api("/students");
    location.pathname = "/cards";
    resolve(json([]));
    await expect(request).rejects.toMatchObject({
      code: "NAVIGATION_CANCELLED",
    });
  });
});
