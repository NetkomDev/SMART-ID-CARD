import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attendanceRouter } from "./attendance.js";
const rpc = vi.fn();
function app(
  permissions = ["attendance.scan", "attendance.read"],
  roles: string[] = [],
) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.auth = {
      user: { id: "actor" } as any,
      accessToken: "fixture",
      client: { rpc } as any,
    };
    req.tenant = {
      schoolId: "school-a",
      membershipId: "m",
      permissions,
      roles,
    };
    next();
  });
  a.use("/attendance", attendanceRouter);
  a.use(((e: any, _req: any, res: any, _next: any) =>
    res
      .status(e.status ?? 500)
      .json({ code: e.code })) as express.ErrorRequestHandler);
  return a;
}
const scan = {
  event_id: "a0000000-0000-4000-8000-000000000001",
  device_id: "b0000000-0000-4000-8000-000000000001",
  identifier: "0012",
  direction: "CHECK_IN",
  occurred_at: "2026-10-31T07:30:00+08:00",
  scanner_name: "Guru A",
  notes: "",
};
beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { results: [] }, error: null });
});
describe("authenticated mobile attendance", () => {
  it("batches through the tenant user RPC once without printed QR token", async () => {
    expect(
      (
        await request(app())
          .post("/attendance/pwa-sync")
          .send({ scans: [scan] })
      ).status,
    ).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("sync_school_attendance", {
      p_school: "school-a",
      p_scans: [scan],
    });
  });
  it("does not allow read-only teacher to scan", async () => {
    expect(
      (
        await request(app(["attendance.read"]))
          .post("/attendance/pwa-sync")
          .send({ scans: [scan] })
      ).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not let gate personnel change school hours", async () => {
    expect(
      (
        await request(app())
          .put("/attendance/rules")
          .send({
            check_in_start: "06:30",
            check_in_end: "07:30",
            check_out_start: "14:00",
          })
      ).status,
    ).toBe(403);
  });
  it("validates school-admin hours and forwards canonical field names", async () => {
    expect(
      (
        await request(app([], ["SCHOOL_ADMIN"]))
          .put("/attendance/rules")
          .send({
            check_in_start: "06:30",
            check_in_end: "07:30",
            check_out_start: "14:00",
          })
      ).status,
    ).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_school_attendance_rules", {
      p_school_id: "school-a",
      p_entry_start: "06:30",
      p_on_time_until: "07:30",
      p_checkout_start: "14:00",
    });
  });
  it("gets school timezone summary with one RPC", async () => {
    expect((await request(app()).get("/attendance/summary")).status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("attendance_school_summary", {
      p_school: "school-a",
    });
  });
});
