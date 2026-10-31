import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), getUserById: vi.fn(), generateLink: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("../lib/supabase.js", () => ({ createServiceClient: () => ({ from: f.from, rpc: f.rpc, auth: { admin: f } }), createPublicClient: () => ({ auth: { verifyOtp: f.verifyOtp } }) }));
import { mountParentOnboarding } from "./parent-onboarding.js";
const input = { token: "a".repeat(64), nisn: "0012345678", date_of_birth: "2010-01-02", full_name: "Wali Siswa", phone: "081234567890" };
let child: object | null, existing: object | null, rate: number, enrollError: object | null, recovered: string | null;
function app() {
  const app = express(), router = express.Router(); app.use(express.json());
  mountParentOnboarding(router, (res) => { res.cookie("test-session", "encrypted", { httpOnly: true }); return "csrf"; });
  app.use(router);
  app.use(((err: any, _req: any, res: any, _next: any) => res.status(err.status ?? 500).json({ code: err.code })) as express.ErrorRequestHandler);
  return app;
}
beforeEach(() => {
  vi.clearAllMocks(); child = { id: "child-a" }; existing = null; rate = 1; enrollError = null; recovered = "parent-a";
  f.from.mockImplementation((table: string) => {
    const q: any = {}; for (const method of ["select", "eq", "is"]) q[method] = vi.fn(() => q);
    q.maybeSingle = async () => ({ data: table === "qr_access_tokens" ? { school_id: "school-a", role_code: "PARENT", revoked_at: null } : table === "students" ? child : existing, error: null }); return q;
  });
  f.rpc.mockImplementation(async (name: string) => name === "increment_api_rate" ? { data: { total_hits: rate } } : name === "consume_parent_recovery" ? { data: recovered } : { data: "child-a", error: enrollError });
  f.createUser.mockResolvedValue({ data: { user: { id: "parent-a" } } });
  f.deleteUser.mockResolvedValue({ error: null });
  f.getUserById.mockResolvedValue({ data: { user: { email: "internal@aksis.local", app_metadata: { parent_passwordless: true } } } });
  f.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "server-only" } } });
  f.verifyOtp.mockResolvedValue({ data: { session: { access_token: "secret-access", refresh_token: "secret-refresh" } } });
});
describe("guardian enrollment and recovery boundary", () => {
  it("provisions a unique guardian and returns only CSRF with a cookie", async () => {
    const res = await request(app()).post("/enroll").send(input).expect(201);
    expect(res.body.data).toEqual({ csrf: "csrf" }); expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(JSON.stringify(res.body)).not.toContain("secret-access");
    expect(f.rpc).toHaveBeenCalledWith("enroll_parent_portal", expect.objectContaining({ p_phone: "+6281234567890", p_nisn: "0012345678", p_user_id: "parent-a" }));
    expect(f.createUser.mock.calls[0][0].app_metadata).toEqual({ parent_passwordless: true });
  });
  it("does not sign into an existing WA identity using child knowledge", async () => {
    existing = { user_id: "another-parent" };
    await request(app()).post("/enroll").send(input).expect(409);
    expect(f.createUser).not.toHaveBeenCalled(); expect(f.generateLink).not.toHaveBeenCalled();
  });
  it("does not create an Auth account for incorrect child details", async () => {
    child = null; await request(app()).post("/enroll").send(input).expect(422); expect(f.createUser).not.toHaveBeenCalled();
  });
  it("compensates Auth creation if transactional enrollment fails", async () => {
    enrollError = { code: "23505" }; await request(app()).post("/enroll").send(input).expect(409);
    expect(f.deleteUser).toHaveBeenCalledWith("parent-a"); expect(f.generateLink).not.toHaveBeenCalled();
  });
  it("blocks excessive attempts before child lookup", async () => {
    rate = 11; await request(app()).post("/enroll").send(input).expect(429); expect(f.from).not.toHaveBeenCalled();
  });
  it("rejects malformed requests before database calls", async () => {
    await request(app()).post("/enroll").send({ ...input, phone: "bad" }).expect(422); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("does not exchange a used/expired personal QR for a session", async () => {
    recovered = null; await request(app()).post("/recover-qr").send({ token: input.token }).expect(401); expect(f.generateLink).not.toHaveBeenCalled();
  });
  it("exchanges a valid personal QR without exposing Auth tokens", async () => {
    const res = await request(app()).post("/recover-qr").send({ token: input.token }).expect(200);
    expect(res.body.data).toEqual({ csrf: "csrf" }); expect(f.getUserById).toHaveBeenCalledWith("parent-a");
  });
});
