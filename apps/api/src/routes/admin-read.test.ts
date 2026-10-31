import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import { classesRouter } from "./classes.js";
import { schoolsRouter } from "./schools.js";
function app(data: unknown) {
  const from = vi.fn(() => {
    const query: any = {};
    for (const method of ["select", "eq", "is", "order"])
      query[method] = vi.fn(() => query);
    query.then = (resolve: any) =>
      Promise.resolve({ data, error: null }).then(resolve);
    query.maybeSingle = async () => ({ data, error: null });
    return query;
  });
  const app = express();
  app.use((req, _res, next) => {
    req.auth = {
      client: { from } as any,
      user: { id: "admin" } as any,
      accessToken: "fixture",
    };
    req.tenant = {
      schoolId: "school-A",
      membershipId: "member-A",
      roles: ["SCHOOL_ADMIN"],
      permissions: ["student.read"],
    };
    next();
  });
  app.use("/classes", classesRouter);
  app.use("/schools", schoolsRouter);
  return { app, from };
}
describe("admin lean reads", () => {
  it("returns database-aggregated counts above the historical row limit and includes empty classes", async () => {
    const f = app([
      {
        id: "classA",
        name: "X A",
        grade_level: 10,
        student_class_history: [{ count: 1201 }],
      },
      {
        id: "classB",
        name: "X B",
        grade_level: 10,
        student_class_history: [{ count: 0 }],
      },
    ]);
    const r = await request(f.app).get("/classes/summary").expect(200);
    expect(r.body.data.map((c: any) => c.student_count)).toEqual([1201, 0]);
    expect(r.body.data[0]).not.toHaveProperty("student_class_history");
    expect(f.from).toHaveBeenCalledTimes(1);
  });
  it("returns tenant context with the current school, without another database request", async () => {
    const f = app({ id: "school-A", name: "Sekolah A" });
    const r = await request(f.app).get("/schools/current").expect(200);
    expect(r.body.data.context).toEqual({
      school_id: "school-A",
      membership_id: "member-A",
      roles: ["SCHOOL_ADMIN"],
      permissions: ["student.read"],
    });
    expect(f.from).toHaveBeenCalledTimes(1);
  });
});
