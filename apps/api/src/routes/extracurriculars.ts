import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { createExtracurricularSchema, createSessionSchema, fastEnrollmentSchema, recordAttendanceSchema, sessionParamsSchema, updateExtracurricularSchema } from "../schemas/extracurricular.js";

const router = Router();
const activityFields = "id,school_id,code,name,description,is_active,created_at,updated_at";

router.get("/", requirePermission("extracurricular.read"), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurriculars").select(activityFields)
    .eq("school_id", req.tenant!.schoolId).is("deleted_at", null).order("name");
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.post("/", requirePermission("extracurricular.manage"), validate({ body: createExtracurricularSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurriculars")
    .insert({ ...req.body, school_id: req.tenant!.schoolId }).select(activityFields).single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.patch("/:id", requirePermission("extracurricular.manage"), validate({ params: idParamsSchema, body: updateExtracurricularSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurriculars").update(req.body)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).select(activityFields).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Extracurricular was not found");
  sendData(res, data);
}));

router.post("/:id/sessions", requirePermission("extracurricular.manage"), validate({ params: idParamsSchema, body: createSessionSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_sessions").insert({
    ...req.body, school_id: req.tenant!.schoolId, extracurricular_id: req.params.id, created_by: req.auth!.user.id
  }).select("*").single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.get("/:id/sessions", requirePermission("extracurricular.read"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_sessions").select("*")
    .eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id).order("starts_at", { ascending: false });
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.get("/:id/members", requirePermission("extracurricular.read"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_members")
    .select("id,student_id,status,enrolled_by,enrolled_at,students(full_name,student_number)")
    .eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id).order("enrolled_at", { ascending: false });
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.post("/:id/members/fast-enroll", requirePermission("extracurricular.manage"), validate({ params: idParamsSchema, body: fastEnrollmentSchema }), asyncHandler(async (req, res) => {
  const record = { school_id: req.tenant!.schoolId, extracurricular_id: req.params.id, student_id: req.body.student_id,
    idempotency_key: req.body.idempotency_key, enrolled_by: req.auth!.user.id };
  const { data, error } = await req.auth!.client.from("extracurricular_members").upsert(record, {
    onConflict: "school_id,idempotency_key", ignoreDuplicates: true
  }).select("*").maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (data) return sendData(res, { ...data, duplicate: false }, 201);
  const { data: existing, error: lookupError } = await req.auth!.client.from("extracurricular_members").select("*")
    .eq("school_id", req.tenant!.schoolId).eq("idempotency_key", req.body.idempotency_key).single();
  if (lookupError) throw fromDatabaseError(lookupError);
  sendData(res, { ...existing, duplicate: true });
}));

router.post("/:id/sessions/:sessionId/attendance", requirePermission("extracurricular.attendance"), validate({ params: sessionParamsSchema, body: recordAttendanceSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_attendance").insert({ ...req.body,
    school_id: req.tenant!.schoolId, extracurricular_id: req.params.id, session_id: req.params.sessionId,
    recorded_by: req.auth!.user.id
  }).select("*").single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.get("/:id/sessions/:sessionId/summary", requirePermission("extracurricular.read"), validate({ params: sessionParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_attendance").select("status")
    .eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id).eq("session_id", req.params.sessionId);
  if (error) throw fromDatabaseError(error);
  const summary = { total: data?.length ?? 0, present: 0, excused: 0, absent: 0 };
  for (const row of data ?? []) summary[row.status.toLowerCase() as "present" | "excused" | "absent"]++;
  sendData(res, summary);
}));

export { router as extracurricularsRouter };
