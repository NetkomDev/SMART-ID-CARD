import { Router } from "express";
import { fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { attendanceListQuerySchema } from "../schemas/attendance.js";

const router = Router();

router.get("/", requirePermission("attendance.read"), validate({ query: attendanceListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, page_size: pageSize, direction, occurred_from: occurredFrom, occurred_to: occurredTo } = req.query as unknown as {
      page: number; page_size: number; direction?: string; occurred_from?: string; occurred_to?: string;
    };
    let query = req.auth!.client.from("attendance_logs").select(
      "id, event_id, student_id, class_id, device_id, direction, source, occurred_at_local, occurred_at_server, is_late, students(full_name, student_number), classes(name), devices(name, device_code)",
      { count: "exact" }
    ).eq("school_id", req.tenant!.schoolId)
      .range((page - 1) * pageSize, page * pageSize - 1)
      .order("occurred_at_local", { ascending: false });
    if (direction) query = query.eq("direction", direction);
    if (occurredFrom) query = query.gte("occurred_at_local", occurredFrom);
    if (occurredTo) query = query.lte("occurred_at_local", occurredTo);
    const { data, error, count } = await query;
    if (error) throw fromDatabaseError(error);
    sendData(res, data ?? [], 200, { page, page_size: pageSize, total: count ?? 0 });
  }));

router.get("/summary", requirePermission("attendance.read"), asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = today.toISOString();
  
  today.setHours(23, 59, 59, 999);
  const endOfDay = today.toISOString();

  const schoolId = req.tenant!.schoolId;

  const [presentRes, lateRes] = await Promise.all([
    req.auth!.client.from("attendance_logs")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("direction", "CHECK_IN")
      .gte("occurred_at_local", startOfDay)
      .lte("occurred_at_local", endOfDay),
    req.auth!.client.from("attendance_logs")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("direction", "CHECK_IN")
      .eq("is_late", true)
      .gte("occurred_at_local", startOfDay)
      .lte("occurred_at_local", endOfDay)
  ]);

  if (presentRes.error) throw fromDatabaseError(presentRes.error);
  if (lateRes.error) throw fromDatabaseError(lateRes.error);

  sendData(res, { total_present: presentRes.count ?? 0, total_late: lateRes.count ?? 0 });
}));

export { router as attendanceRouter };
