import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

let createApp: typeof import("./app.js").createApp;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
  ({ createApp } = await import("./app.js"));
});

describe("Core API envelope", () => {
  it("serves health using the success envelope", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { status: "ok" } });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("uses the standard error envelope for unknown routes", async () => {
    const response = await request(createApp()).get("/not-found").set("x-request-id", "contract-test");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: "ROUTE_NOT_FOUND", message: "Route GET /not-found was not found" },
      request_id: "contract-test"
    });
  });

  it("rejects unauthenticated tenant routes", async () => {
    const response = await request(createApp()).get("/api/v1/students");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("requires device credentials without contacting Supabase", async () => {
    const response = await request(createApp()).get("/api/v1/devices/config");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("DEVICE_AUTH_INVALID");
  });

  it("validates login input before calling Supabase", async () => {
    const response = await request(createApp()).post("/api/v1/auth/login").send({ email: "bad", password: "short" });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toBeDefined();
  });

  it("normalizes malformed JSON into the error envelope", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/login")
      .set("content-type", "application/json")
      .send('{"email":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
