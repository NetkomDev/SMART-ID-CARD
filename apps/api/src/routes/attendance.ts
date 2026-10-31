import { Router } from "express";
import { fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission, requireRole } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import {
  attendanceListQuerySchema,
  attendanceRulesUpdateSchema,
  pwaAttendanceBatchSyncSchema,
  pwaAttendanceScanSchema,
  attendanceBootstrapQuerySchema,
  attendanceRegisterDeviceSchema,
} from "../schemas/attendance.js";

const router = Router();

router.get(
  "/",
  requirePermission("attendance.read"),
  validate({ query: attendanceListQuerySchema }),
  asyncHandler(async (req, res) => {
    const {
      page,
      page_size: pageSize,
      direction,
      occurred_from: occurredFrom,
      occurred_to: occurredTo,
    } = req.query as unknown as {
      page: number;
      page_size: number;
      direction?: string;
      occurred_from?: string;
      occurred_to?: string;
    };
    let query = req
      .auth!.client.from("attendance_logs")
      .select(
        "id, event_id, student_id, class_id, device_id, direction, source, occurred_at_local, occurred_at_server, is_late, is_early_departure, notes, scanner_name, students(full_name, student_number), classes(name), devices(name, device_code)",
        { count: "exact" },
      )
      .eq("school_id", req.tenant!.schoolId)
      .range((page - 1) * pageSize, page * pageSize - 1)
      .order("occurred_at_local", { ascending: false });
    if (direction) query = query.eq("direction", direction);
    if (occurredFrom) query = query.gte("occurred_at_local", occurredFrom);
    if (occurredTo) query = query.lte("occurred_at_local", occurredTo);
    const { data, error, count } = await query;
    if (error) throw fromDatabaseError(error);
    sendData(res, data ?? [], 200, {
      page,
      page_size: pageSize,
      total: count ?? 0,
    });
  }),
);

router.get(
  "/summary",
  requirePermission("attendance.read"),
  asyncHandler(async (req, res) => {
    const { data, error } = await req.auth!.client.rpc(
      "attendance_school_summary",
      { p_school: req.tenant!.schoolId },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data);
  }),
);
router.get(
  "/rules",
  requirePermission("attendance.read"),
  asyncHandler(async (req, res) => {
    const { data, error } = await req.auth!.client.rpc(
      "get_school_attendance_settings",
      { p_school: req.tenant!.schoolId },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data);
  }),
);
router.put(
  "/rules",
  requireRole("SCHOOL_ADMIN"),
  validate({ body: attendanceRulesUpdateSchema }),
  asyncHandler(async (req, res) => {
    const { check_in_start, check_in_end, check_out_start } = req.body;
    const { data, error } = await req.auth!.client.rpc(
      "update_school_attendance_rules",
      {
        p_school_id: req.tenant!.schoolId,
        p_entry_start: check_in_start,
        p_on_time_until: check_in_end,
        p_checkout_start: check_out_start,
      },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data);
  }),
);
router.get(
  "/state",
  requirePermission("attendance.scan"),
  asyncHandler(async (req, res) => {
    const { data, error } = await req.auth!.client.rpc(
      "attendance_scanner_state",
      { p_school: req.tenant!.schoolId },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data);
  }),
);
router.get(
  "/bootstrap",
  requirePermission("attendance.scan"),
  validate({ query: attendanceBootstrapQuerySchema }),
  asyncHandler(async (req, res) => {
    const { data, error } = await req.auth!.client.rpc(
      "attendance_scanner_bootstrap",
      {
        p_school: req.tenant!.schoolId,
        p_after: req.query.after ?? null,
        p_limit: 500,
      },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data);
  }),
);
router.post(
  "/pwa-sync",
  requirePermission("attendance.scan"),
  validate({ body: pwaAttendanceBatchSyncSchema }),
  asyncHandler(async (req, res) => {
    const { data, error } = await req.auth!.client.rpc(
      "sync_school_attendance",
      { p_school: req.tenant!.schoolId, p_scans: req.body.scans },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data);
  }),
);
router.post(
  "/pwa-scan",
  requirePermission("attendance.scan"),
  validate({ body: pwaAttendanceScanSchema }),
  asyncHandler(async (req, res) => {
    const { data, error } = await req.auth!.client.rpc(
      "sync_school_attendance",
      { p_school: req.tenant!.schoolId, p_scans: [req.body] },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data, 201);
  }),
);

router.post(
  "/register-device",
  requirePermission("attendance.scan"),
  validate({ body: attendanceRegisterDeviceSchema }),
  asyncHandler(async (req, res) => {
    const { device_id, scanner_name } = req.body;
    const { data, error } = await req.auth!.client.rpc(
      "bind_attendance_scanner",
      { p_device_id: device_id, p_scanner_name: scanner_name },
    );
    if (error) throw fromDatabaseError(error);
    sendData(res, data ?? { bound: true });
  }),
);

export { router as attendanceRouter };
