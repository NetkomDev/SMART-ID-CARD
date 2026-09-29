import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { readWasteDashboard } from "./waste-dashboard.js";

const now = new Date("2026-09-29T17:00:00Z"); // September 30 in Makassar.
type Row = Record<string, unknown>;
function fixture(options: { legacy?: boolean; allowed?: boolean; active?: boolean; portal?: Row; failure?: string; rowCap?: number } = {}) {
  const rows: Record<string, Row[]> = {
    qr_access_tokens: [{ auth_user_id: "operator", school_id: "school-a", role_code: "WASTE_STAFF", revoked_at: null, expires_at: null, ...options.portal }],
    schools: [{ id: "school-a", is_active: true, deleted_at: null, timezone: "Asia/Makassar", waste_organic_points_per_kg: 7.5, waste_inorganic_points_per_kg: 10 }],
    classes: ["a", "b"].map(id => ({ id, school_id: "school-a", name: `Kelas ${id}`, is_active: true, deleted_at: null })),
    students: ["one", "two", "zero"].map(id => ({ id, school_id: "school-a", full_name: id, is_active: true, deleted_at: null })),
    student_class_history: ["one", "two", "zero"].map((id, i) => ({ id, student_id: id, class_id: i ? "b" : "a", school_id: "school-a", is_current: true })),
    waste_transactions: [
      ...Array.from({ length: 1001 }, (_, i) => ({ id: `t${i}`, school_id: "school-a", student_id: "one", class_id: "a", total_kg: .001, points_earned: null, created_at: "2026-09-29T16:30:00Z" })),
      { id: "second", school_id: "school-a", student_id: "two", class_id: "b", total_kg: 4, points_earned: 40, created_at: "2026-09-29T16:00:00Z" },
      { id: "yesterday", school_id: "school-a", student_id: "one", class_id: "a", total_kg: 2, points_earned: 15, created_at: "2026-09-29T15:59:59Z" },
      { id: "last-month", school_id: "school-a", student_id: "one", class_id: "a", total_kg: 10, points_earned: 75, created_at: "2026-08-31T15:59:59Z" },
      { id: "future", school_id: "school-a", student_id: "one", class_id: "a", total_kg: 50, points_earned: 375, created_at: "2026-10-01T00:00:00Z" },
      { id: "other-school", school_id: "school-b", student_id: "one", class_id: "a", total_kg: 100, points_earned: 750, created_at: "2026-09-29T16:30:00Z" }
    ]
  };
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  const service = { from: (table: string) => {
    let columns = "", start = 0, end = Infinity, single = false;
    const filters: [string, unknown][] = [];
    const predicates: ((row: Row) => boolean)[] = [];
    const query = {
      select(value: string) { columns = value; return query; },
      eq(key: string, value: unknown) { filters.push([key, value]); predicates.push(row => row[key] === value); return query; },
      is(key: string, value: unknown) { predicates.push(row => row[key] === value); return query; },
      gte(key: string, value: string) { predicates.push(row => String(row[key]) >= value); return query; },
      lte(key: string, value: string) { predicates.push(row => String(row[key]) <= value); return query; },
      order() { return query; },
      returns() { return query; },
      range(a: number, b: number) { start = a; end = b; return query; },
      limit(n: number) { end = n - 1; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: unknown) => unknown) {
        reads.push({ table, filters });
        if (options.failure === table) return Promise.resolve(resolve({ data: null, error: { code: "42501", message: "denied" } }));
        const missing = options.legacy && (columns.includes("waste_organic_points_per_kg") ? "waste_organic_points_per_kg" : columns.includes("points_earned") ? "points_earned" : null);
        if (missing) return Promise.resolve(resolve({ data: null, error: { code: "42703", message: `column ${missing} does not exist` } }));
        const data = (rows[table] ?? []).filter(row => predicates.every(p => p(row))).slice(start, Math.min(end + 1, start + (options.rowCap ?? Infinity)))
          .map(row => Object.fromEntries(columns.split(",").map(k => [k, row[k]])));
        return Promise.resolve(resolve({ data: single ? data[0] ?? null : data, error: null }));
      }
    };
    return query;
  } } as unknown as SupabaseClient;
  const factory = vi.fn(() => service);
  const user = { rpc: vi.fn(async (name: string) => ({ data: name === "portal_session_active" ? options.active !== false : options.allowed !== false, error: null })) } as unknown as SupabaseClient;
  const load = (period: "today" | "month" | "all" = "today") => readWasteDashboard(user, "operator", true, "school-a", period, factory, now);
  return { load, factory, reads };
}

describe("waste dashboard compatibility reader", () => {
  it("does not truncate totals when PostgREST caps pages below 500 rows", async () => {
    const data = await fixture({ rowCap: 100 }).load();
    expect(data.today).toMatchObject({ transactions: 1002, total_kg: 5.001, students: 2 });
  });
  it("aggregates all pages across classes, enforces school scope and school-local dates", async () => {
    const { load, reads } = fixture();
    const data = await load();
    expect(data.today).toEqual({ students: 2, total_kg: 5.001, points: 40, transactions: 1002, unscored: 1001 });
    expect(data.classes.map(c => c.total_kg)).toEqual([4, 1.001]);
    expect(data.top_students.map(s => s.student_id)).toEqual(["two", "one"]);
    expect(data.bottom_students[0]).toMatchObject({ student_id: "zero", total_kg: 0 });
    expect(reads.filter(r => ["classes", "students", "student_class_history", "waste_transactions"].includes(r.table))
      .every(r => r.filters.some(([k, v]) => k === "school_id" && v === "school-a"))).toBe(true);
    expect(data).not.toHaveProperty("waste_transactions");
  });
  it("keeps today's totals stable across month/all periods and excludes future data", async () => {
    const { load } = fixture();
    const month = await load("month"), all = await load("all");
    expect(month.today).toEqual(all.today);
    expect(month.classes.reduce((n, c) => n + c.total_kg, 0)).toBeCloseTo(7.001, 3);
    expect(all.classes.reduce((n, c) => n + c.total_kg, 0)).toBeCloseTo(17.001, 3);
  });
  it("reads legacy columns without inventing historical points or reward rates", async () => {
    const data = await fixture({ legacy: true }).load();
    expect(data.rates).toEqual({ organic: null, inorganic: null });
    expect(data.today).toMatchObject({ total_kg: 5.001, points: 0, unscored: 1002 });
  });
  it.each([{ allowed: false }, { active: false }])("denies access before privileged reads: %j", async options => {
    const { load, factory } = fixture(options);
    await expect(load()).rejects.toMatchObject({ status: 403 });
    expect(factory).not.toHaveBeenCalled();
  });
  it.each([{ school_id: "school-b" }, { role_code: "PARENT" }, { revoked_at: now.toISOString() }, { expires_at: "2026-09-01T00:00:00Z" }])("rejects invalid QR context: %j", async portal => {
    const { load, reads } = fixture({ portal });
    await expect(load()).rejects.toMatchObject({ status: 403 });
    expect(reads.map(r => r.table)).toEqual(["qr_access_tokens"]);
  });
  it("does not turn unrelated database failures into empty rankings", async () => {
    await expect(fixture({ failure: "waste_transactions" }).load()).rejects.toMatchObject({ status: 403 });
  });
});
