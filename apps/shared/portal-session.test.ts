import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PortalSession } from "./portal-session";
const portal = { id: "qr-a", school_id: "school-a", school_name: "Sekolah A", role_code: "WASTE_STAFF", metadata: { class_id: "class-a" } };
const access = { session: { access_token: "access-1", refresh_token: "refresh-1" }, portal };
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const unauthorized = (code = "AUTH_INVALID") => new Response(JSON.stringify({ success: false, error: { code, message: "Akses ditolak" } }), { status: 401 });
let storage: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("window", { location: { href: "https://aksis.test/waste/" }, history: { replaceState: vi.fn() } });
  vi.stubGlobal("navigator", {});
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
describe("persistent QR portal access", () => {
  it("does not unlock a portal from a bare URL or a class parameter", async () => {
    window.location.href += '?classId=class-a';
    expect(await new PortalSession("WASTE_STAFF").start()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("exchanges a fragment QR, removes the secret from URL, and persists only the renewable session", async () => {
    const token = "a".repeat(64); window.location.href += `#token=${token}`;
    fetchMock.mockResolvedValueOnce(response(access)).mockResolvedValueOnce(response(portal));
    expect(await new PortalSession("WASTE_STAFF").start()).toBe(true);
    expect(window.history.replaceState).toHaveBeenCalledWith({}, "", "/waste/");
    expect(fetchMock.mock.calls[0]![1].body).toBe(JSON.stringify({ token, role_code: "WASTE_STAFF" }));
    expect([...storage.values()].join()).not.toContain(token);
    expect(new PortalSession("WASTE_STAFF").context?.school_id).toBe("school-a");
  });
  it("reopens without QR and refreshes an expired JWT transparently", async () => {
    storage.set("aksis.portal.WASTE_STAFF.v1", JSON.stringify(access));
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(response({ access_token: "access-2", refresh_token: "refresh-2" })).mockResolvedValueOnce(response(portal));
    expect(await new PortalSession("WASTE_STAFF").start()).toBe(true);
    expect(fetchMock.mock.calls[2]![1].headers.get("authorization")).toBe("Bearer access-2");
    expect(fetchMock.mock.calls[2]![1].headers.get("x-school-id")).toBe("school-a");
  });
  it("clears access immediately when administrator revokes the QR", async () => {
    storage.set("aksis.portal.WASTE_STAFF.v1", JSON.stringify(access));
    fetchMock.mockResolvedValueOnce(unauthorized("PORTAL_ACCESS_INVALID"));
    const client = new PortalSession("WASTE_STAFF");
    await expect(client.start()).rejects.toThrow("Akses ditolak");
    expect(client.connected).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("preserves saved access on temporary network failure", async () => {
    storage.set("aksis.portal.WASTE_STAFF.v1", JSON.stringify(access));
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const client = new PortalSession("WASTE_STAFF");
    await expect(client.start()).rejects.toThrow("offline"); expect(client.connected).toBe(true);
  });
  it("does not reuse a previous school when a newly scanned QR fails", async () => {
    storage.set("aksis.portal.WASTE_STAFF.v1", JSON.stringify(access)); window.location.href += "#token=invalid";
    fetchMock.mockResolvedValueOnce(unauthorized("PORTAL_ACCESS_INVALID"));
    const client = new PortalSession("WASTE_STAFF");
    await expect(client.start()).rejects.toThrow(); expect(client.connected).toBe(false);
  });
  it("does not restore another portal's session and tolerates malformed storage", async () => {
    storage.set("aksis.portal.WASTE_STAFF.v1", JSON.stringify(access));
    expect(await new PortalSession("PARENT").start()).toBe(false);
    storage.set("aksis.portal.PARENT.v1", "bad json");
    expect(await new PortalSession("PARENT").start()).toBe(false);
  });
  it("serializes simultaneous token refresh in one client", async () => {
    storage.set("aksis.portal.WASTE_STAFF.v1", JSON.stringify(access));
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) { await new Promise(r => setTimeout(r, 10)); return response({ access_token: "access-2", refresh_token: "refresh-2" }); }
      return new Headers(init.headers).get("authorization") === "Bearer access-1" ? unauthorized() : response({ ok: true });
    });
    const client = new PortalSession("WASTE_STAFF");
    await Promise.all([client.request("/a"), client.request("/b")]);
    expect(fetchMock.mock.calls.filter(c => c[0].endsWith("/auth/refresh"))).toHaveLength(1);
  });
});
