import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { createServiceClient } from "../lib/supabase.js";

type Period = "today" | "month" | "all";
type ClassRow = { id: string; name: string };
type StudentRow = { id: string; full_name: string };
type Membership = { student_id: string; class_id: string };
type Deposit = { student_id: string; class_id: string; total_kg: number; created_at: string; points_earned?: number | null };

const missingColumn = (error: PostgrestError | null, name: string) =>
  error?.code === "42703" && error.message.includes(name);

// Read every page: PostgREST caps individual responses, including service-role reads.
async function readAll<T>(query: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; ;) {
    const { data, error } = await query(start, start + 499);
    if (error) throw fromDatabaseError(error);
    result.push(...data ?? []);
    if (!data?.length) return result;
    // Respect deployments with a PostgREST row cap smaller than our requested page.
    start += data.length;
  }
}

/** Compatibility path for schools whose database does not yet have waste_dashboard.
 * Authorization uses the caller's RLS client; only the aggregate read uses service_role.
 * Never expose raw rows, credentials or data from a school chosen in query parameters.
 */
export async function readWasteDashboard(
  userClient: SupabaseClient, userId: string, portalAccess: boolean,
  schoolId: string, period: Period,
  serviceFactory: () => SupabaseClient = createServiceClient,
  now = new Date()
) {
  const [session, permission] = await Promise.all([
    userClient.rpc("portal_session_active"),
    userClient.rpc("has_school_permission", { target_school_id: schoolId, permission_code: "waste.read" })
  ]);
  if (session.error) throw fromDatabaseError(session.error);
  if (permission.error) throw fromDatabaseError(permission.error);
  if (session.data !== true || permission.data !== true) throw new ApiError(403, "FORBIDDEN", "Akses klasemen ditolak.");

  const service = serviceFactory();
  const { data: portal, error: portalError } = await service.from("qr_access_tokens")
    .select("school_id,role_code,revoked_at,expires_at").eq("auth_user_id", userId).maybeSingle();
  if (portalError) throw fromDatabaseError(portalError);
  if ((portalAccess && !portal) || (portal && (portal.school_id !== schoolId || portal.role_code !== "WASTE_STAFF"
    || portal.revoked_at || (portal.expires_at && new Date(portal.expires_at) <= now)))) {
    throw new ApiError(403, "FORBIDDEN", "Akses klasemen ditolak.");
  }

  const schoolQuery = (columns: string) => service.from("schools").select(columns)
    .eq("id", schoolId).eq("is_active", true).is("deleted_at", null).maybeSingle();
  let schoolResult = await schoolQuery("timezone,waste_organic_points_per_kg,waste_inorganic_points_per_kg");
  if (missingColumn(schoolResult.error, "waste_organic_points_per_kg") || missingColumn(schoolResult.error, "waste_inorganic_points_per_kg")) {
    schoolResult = await schoolQuery("timezone");
  }
  if (schoolResult.error) throw fromDatabaseError(schoolResult.error);
  if (!schoolResult.data) throw new ApiError(404, "SCHOOL_NOT_FOUND", "Sekolah tidak tersedia.");
  const school = schoolResult.data as unknown as { timezone: string; waste_organic_points_per_kg?: number; waste_inorganic_points_per_kg?: number };
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const localDate = (date: Date) => {
    const parts = formatter.formatToParts(date);
    return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
  };
  const todayDate = localDate(now);
  const startDate = period === "month" ? `${todayDate.slice(0, 7)}-01` : todayDate;
  // A coarse UTC bound reduces transfer; local calendar dates below enforce exact timezone boundaries.
  const lowerBound = new Date(Date.parse(`${startDate}T00:00:00Z`) - 36 * 3600_000).toISOString();
  const asOf = now.toISOString();
  const baseColumns = "student_id,class_id,total_kg,created_at";
  const depositsQuery = (columns: string) => {
    let query = service.from("waste_transactions").select(columns).eq("school_id", schoolId).lte("created_at", asOf);
    if (period !== "all") query = query.gte("created_at", lowerBound);
    return query.order("id");
  };
  const probe = await depositsQuery(`${baseColumns},points_earned`).limit(0);
  const hasPoints = !missingColumn(probe.error, "points_earned");
  if (probe.error && hasPoints) throw fromDatabaseError(probe.error);

  const [classes, students, memberships, deposits] = await Promise.all([
    readAll<ClassRow>((a, b) => service.from("classes").select("id,name").eq("school_id", schoolId).eq("is_active", true).is("deleted_at", null).order("id").range(a, b)),
    readAll<StudentRow>((a, b) => service.from("students").select("id,full_name").eq("school_id", schoolId).eq("is_active", true).is("deleted_at", null).order("id").range(a, b)),
    readAll<Membership>((a, b) => service.from("student_class_history").select("student_id,class_id").eq("school_id", schoolId).eq("is_current", true).order("id").range(a, b)),
    readAll<Deposit>((a, b) => depositsQuery(hasPoints ? `${baseColumns},points_earned` : baseColumns).range(a, b).returns<Deposit[]>())
  ]);
  const classTotals = new Map(classes.map(c => [c.id, { class_id: c.id, class_name: c.name, grams: 0, students: new Set<string>() }]));
  const studentTotals = new Map<string, number>();
  const todayStudents = new Set<string>();
  let todayGrams = 0, pointsCents = 0, transactions = 0, unscored = 0;
  for (const row of deposits) {
    const date = localDate(new Date(row.created_at));
    const grams = Math.round(Number(row.total_kg) * 1000);
    if (date === todayDate) {
      todayStudents.add(row.student_id); todayGrams += grams; transactions++;
      if (row.points_earned == null) unscored++; else pointsCents += Math.round(Number(row.points_earned) * 100);
    }
    if (period !== "all" && date < startDate) continue;
    const cls = classTotals.get(row.class_id);
    if (cls) { cls.grams += grams; cls.students.add(row.student_id); }
    studentTotals.set(row.student_id, (studentTotals.get(row.student_id) ?? 0) + grams);
  }
  const studentMap = new Map(students.map(s => [s.id, s]));
  const rankedStudents = memberships.flatMap(m => {
    const student = studentMap.get(m.student_id), cls = classTotals.get(m.class_id);
    return student && cls ? [{ student_id: student.id, full_name: student.full_name, class_name: cls.class_name, total_kg: (studentTotals.get(student.id) ?? 0) / 1000 }] : [];
  });
  const byStudentName = (a: typeof rankedStudents[number], b: typeof rankedStudents[number]) => a.full_name.localeCompare(b.full_name, "id") || a.student_id.localeCompare(b.student_id);
  return {
    period, timezone: school.timezone, as_of: asOf,
    rates: { organic: school.waste_organic_points_per_kg ?? null, inorganic: school.waste_inorganic_points_per_kg ?? null },
    today: { students: todayStudents.size, total_kg: todayGrams / 1000, points: pointsCents / 100, transactions, unscored },
    classes: [...classTotals.values()].map(c => ({ class_id: c.class_id, class_name: c.class_name, total_kg: c.grams / 1000, student_count: c.students.size }))
      .sort((a, b) => b.total_kg - a.total_kg || a.class_name.localeCompare(b.class_name, "id") || a.class_id.localeCompare(b.class_id)),
    top_students: rankedStudents.filter(s => s.total_kg > 0).sort((a, b) => b.total_kg - a.total_kg || byStudentName(a, b)).slice(0, 3),
    bottom_students: rankedStudents.sort((a, b) => a.total_kg - b.total_kg || byStudentName(a, b)).slice(0, 3)
  };
}
