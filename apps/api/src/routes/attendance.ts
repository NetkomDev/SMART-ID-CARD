import { createHash } from "node:crypto";
import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { createPublicClient } from "../lib/supabase.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, requireTenant } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import {
  attendanceListQuerySchema,
  attendanceRulesUpdateSchema,
  pwaAttendanceBatchSyncSchema,
  pwaAttendanceScanSchema
} from "../schemas/attendance.js";

const router = Router();

router.get("/", requireAuth, requireTenant, requirePermission("attendance.read"), validate({ query: attendanceListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, page_size: pageSize, direction, occurred_from: occurredFrom, occurred_to: occurredTo } = req.query as unknown as {
      page: number; page_size: number; direction?: string; occurred_from?: string; occurred_to?: string;
    };
    let query = req.auth!.client.from("attendance_logs").select(
      "id, event_id, student_id, class_id, device_id, direction, source, occurred_at_local, occurred_at_server, is_late, is_early_departure, notes, scanner_name, students(full_name, student_number), classes(name), devices(name, device_code)",
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

router.get("/summary", requireAuth, requireTenant, requirePermission("attendance.read"), asyncHandler(async (req, res) => {
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

// Manage school attendance rules (Jam Pelajaran / Jam Masuk & Pulang)
router.get("/rules", requireAuth, requireTenant, asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("get_or_create_school_attendance_rules", {
    p_school_id: req.tenant!.schoolId
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

router.put("/rules", requireAuth, requireTenant, requirePermission("attendance.manage"), validate({ body: attendanceRulesUpdateSchema }), asyncHandler(async (req, res) => {
  const { entry_start, on_time_until, checkout_start } = req.body;
  const { data, error } = await req.auth!.client.rpc("update_school_attendance_rules", {
    p_school_id: req.tenant!.schoolId,
    p_entry_start: entry_start,
    p_on_time_until: on_time_until,
    p_checkout_start: checkout_start
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

// Mobile Multi-Scanner Gate Attendance (Picket Teachers & Security)
router.post("/pwa-scan", validate({ body: pwaAttendanceScanSchema }), asyncHandler(async (req, res) => {
  const { token, event_id, identifier, direction, occurred_at, notes, scanner_name } = req.body;
  const hash = createHash("sha256").update(token).digest("hex");
  const publicClient = createPublicClient();
  const { data, error } = await publicClient.rpc("ingest_pwa_attendance_scan", {
    p_token_hash: hash,
    p_event_id: event_id,
    p_identifier: identifier,
    p_direction: direction,
    p_occurred_at: occurred_at,
    p_notes: notes || null,
    p_scanner_name: scanner_name || null
  });

  if (error) throw fromDatabaseError(error);
  if (data?.success === false) {
    throw new ApiError(404, data?.code || "NOT_FOUND", data?.message || "Identitas siswa tidak ditemukan.");
  }
  sendData(res, data, 201);
}));

router.post("/pwa-sync", validate({ body: pwaAttendanceBatchSyncSchema }), asyncHandler(async (req, res) => {
  const { token, scans } = req.body;
  const hash = createHash("sha256").update(token).digest("hex");
  const publicClient = createPublicClient();
  const { data, error } = await publicClient.rpc("sync_pwa_attendance_batch", {
    p_token_hash: hash,
    p_scans: scans
  });

  if (error) throw fromDatabaseError(error);
  sendData(res, data, 200);
}));

export { router as attendanceRouter };

