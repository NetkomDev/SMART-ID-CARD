import express from "express";
import request from "supertest";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { studentsRouter } from "./students.js";
import { libraryRouter } from "./library.js";
import { extracurricularsRouter } from "./extracurriculars.js";
const id = "11111111-1111-4111-8111-111111111111",
  activity = "22222222-2222-4222-8222-222222222222",
  sid = "33333333-3333-4333-8333-333333333333";
const student = { id, full_name: "Siswa Uji", nisn: "0012345678" };
let member: any, students: any[], duplicate: boolean;
const calls: any[] = [];
const rpc = vi.fn();
function app(permission = true) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = {
      schoolId: "school-a",
      membershipId: "member-a",
      roles: [],
      permissions: permission
        ? ["student.read", "library.visit", "extracurricular.attendance"]
        : [],
    };
    req.auth = {
      user: { id: "actor" } as any,
      accessToken: "fixture",
      client: {
        rpc,
        from: (table: string) => {
          const q: any = {};
          for (const method of ["select", "eq", "is", "or", "insert"])
            q[method] = (...args: any[]) => {
              calls.push({ table, method, args });
              return q;
            };
          q.limit = async () => ({ data: students, error: null });
          q.maybeSingle = async () => ({
            data:
              table === "extracurricular_members"
                ? member
                : { id: "attendance", status: "PRESENT", notes: null },
            error: null,
          });
          q.single = async () =>
            duplicate
              ? { data: null, error: { code: "23505", message: "duplicate" } }
              : { data: { id: "attendance", status: "PRESENT" }, error: null };
          return q;
        },
      } as any,
    };
    next();
  });
  app.use("/students", studentsRouter);
  app.use("/library", libraryRouter);
  app.use("/extracurriculars", extracurricularsRouter);
  app.use(((err: any, _req: any, res: any, _next: any) =>
    res
      .status(err.status ?? 500)
      .json({ code: err.code })) as express.ErrorRequestHandler);
  return app;
}
beforeEach(() => {
  member = { id: "member", status: "ACTIVE" };
  students = [student];
  duplicate = false;
  calls.length = 0;
  rpc
    .mockReset()
    .mockResolvedValue({ data: { ...student, duplicate: false }, error: null });
});
describe("scoped scanner backend", () => {
  it("resolves a complete NISN with one scoped user query and retains leading zeros", async () => {
    const r = await request(app())
      .post("/students/resolve")
      .send({ identity: "0012345678" })
      .expect(200);
    expect(r.body.data.id).toBe(id);
    expect(rpc).not.toHaveBeenCalled();
    expect(calls).toContainEqual({
      table: "students",
      method: "eq",
      args: ["school_id", "school-a"],
    });
    expect(calls).toContainEqual({
      table: "students",
      method: "or",
      args: ["nisn.eq.0012345678,student_number.eq.0012345678"],
    });
  });
  it("rejects ambiguous student numbers without guessing a family/student", async () => {
    students = [student, { ...student, id: "other" }];
    await request(app())
      .post("/students/resolve")
      .send({ identity: "0012345678" })
      .expect(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the authorized card RPC for printed QR and numeric RFID fallback", async () => {
    await request(app())
      .post("/students/resolve")
      .send({ identity: "a".repeat(48) })
      .expect(200);
    expect(rpc).toHaveBeenLastCalledWith("resolve_student_card", {
      p_school: "school-a",
      p_qr: "a".repeat(48),
    });
    students = [];
    await request(app())
      .post("/students/resolve")
      .send({ identity: "12345678" })
      .expect(200);
    expect(rpc).toHaveBeenLastCalledWith("resolve_student_card", {
      p_school: "school-a",
      p_qr: "12345678",
    });
  });
  it("rejects unauthorized or malformed identifiers before any data lookup", async () => {
    await request(app(false))
      .post("/students/resolve")
      .send({ identity: "0012345678" })
      .expect(403);
    await request(app())
      .post("/students/resolve")
      .send({ identity: "name,or=true" })
      .expect(422);
    expect(calls).toEqual([]);
  });
  it("records a library visit through one existing scoped RPC without service-role prequeries", async () => {
    await request(app())
      .post("/library/visits")
      .send({
        event_id: id,
        card_uid: "0012345678",
        occurred_at: new Date().toISOString(),
        local_sequence: 1,
        metadata: {},
      })
      .expect(201);
    expect(calls).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "record_portal_library_visit",
      expect.objectContaining({
        target_school_id: "school-a",
        p_card_uid: "0012345678",
        p_event_id: id,
      }),
    );
  });
  it("resolves and records extracurricular attendance in one browser request", async () => {
    const r = await request(app())
      .post(`/extracurriculars/${activity}/sessions/${sid}/scan`)
      .send({ identity: "0012345678" })
      .expect(201);
    expect(r.body.data.needs_enrollment).toBe(false);
    expect(calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
      school_id: "school-a",
      extracurricular_id: activity,
      session_id: sid,
      student_id: id,
      status: "PRESENT",
    });
  });
  it("requires explicit enrollment and rejects inactive membership before recording", async () => {
    member = null;
    const r = await request(app())
      .post(`/extracurriculars/${activity}/sessions/${sid}/scan`)
      .send({ identity: "0012345678" })
      .expect(200);
    expect(r.body.data.needs_enrollment).toBe(true);
    expect(calls.some((c) => c.method === "insert")).toBe(false);
    member = { id: "member", status: "INACTIVE" };
    await request(app())
      .post(`/extracurriculars/${activity}/sessions/${sid}/scan`)
      .send({ identity: "0012345678" })
      .expect(409);
  });
  it("returns an identical recorded attendance as duplicate, retaining idempotency", async () => {
    duplicate = true;
    const r = await request(app())
      .post(`/extracurriculars/${activity}/sessions/${sid}/scan`)
      .send({ identity: "0012345678" })
      .expect(200);
    expect(r.body.data.attendance.duplicate).toBe(true);
  });
});
