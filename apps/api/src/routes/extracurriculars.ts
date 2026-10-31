import type { Request } from "express";
import { resolvePortalStudent, studentIdentitySchema } from "../lib/portal-student.js";
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

router.get("/:id/sessions", requirePermission("extracurricular.read"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_sessions").select("id,name,starts_at,ends_at,status")
    .eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id).order("starts_at", { ascending: false });
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.post("/:id/sessions", requirePermission("extracurricular.manage"), validate({ params: idParamsSchema, body: createSessionSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_sessions").insert({
    ...req.body, school_id: req.tenant!.schoolId, extracurricular_id: req.params.id, created_by: req.auth!.user.id
  }).select("*").single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
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
    onConflict: "school_id,extracurricular_id,student_id", ignoreDuplicates: true
  }).select("*").maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (data) return sendData(res, { ...data, duplicate: false }, 201);
  const { data: existing, error: lookupError } = await req.auth!.client.from("extracurricular_members").select("*")
    .eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id).eq("student_id", req.body.student_id).single();
  if (lookupError) throw fromDatabaseError(lookupError);
  if (existing.status !== "ACTIVE") throw new ApiError(409, "CONFLICT", "Keanggotaan siswa tidak aktif. Hubungi pengelola kegiatan.");
  sendData(res, { ...existing, duplicate: true });
}));

async function recordActivityAttendance(req: Request, studentId: string, status: string, notes?: string) {
  const { data: member, error: memberError } = await req.auth!.client.from("extracurricular_members")
    .select("id,status").eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id)
    .eq("student_id", studentId).maybeSingle();
  if (memberError) throw fromDatabaseError(memberError);
  if (!member) throw new ApiError(409, "EXTRACURRICULAR_MEMBER_REQUIRED", "Siswa belum terdaftar sebagai anggota kegiatan.");
  if (member.status !== "ACTIVE") throw new ApiError(409, "CONFLICT", "Keanggotaan siswa tidak aktif. Hubungi pengelola kegiatan.");
  const { data, error } = await req.auth!.client.from("extracurricular_attendance").insert({ student_id: studentId, status, notes: notes ?? null,
    school_id: req.tenant!.schoolId, extracurricular_id: req.params.id, session_id: req.params.sessionId,
    recorded_by: req.auth!.user.id
  }).select("*").single();
  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await req.auth!.client.from("extracurricular_attendance").select("*")
      .eq("school_id", req.tenant!.schoolId).eq("session_id", req.params.sessionId).eq("extracurricular_id", req.params.id)
      .eq("student_id", studentId).maybeSingle();
    if (lookupError) throw fromDatabaseError(lookupError);
    if (existing && existing.status === status && (existing.notes ?? null) === (notes ?? null)) {
      return { data: { ...existing, duplicate: true }, status: 200 };
    }
  }
  if (error) throw fromDatabaseError(error);
  return { data, status: 201 };
}

router.post("/:id/sessions/:sessionId/attendance", requirePermission("extracurricular.attendance"), validate({ params: sessionParamsSchema, body: recordAttendanceSchema }), asyncHandler(async (req, res) => {
  const result = await recordActivityAttendance(req, req.body.student_id, req.body.status, req.body.notes);
  sendData(res, result.data, result.status);
}));

router.post("/:id/sessions/:sessionId/scan", requirePermission("student.read"), requirePermission("extracurricular.attendance"), validate({params:sessionParamsSchema,body:studentIdentitySchema}), asyncHandler(async(req,res)=>{
  const student = await resolvePortalStudent(req, req.body.identity);
  try {
    const result = await recordActivityAttendance(req,student.id,"PRESENT");
    sendData(res,{student,attendance:result.data,needs_enrollment:false},result.status);
  } catch(error) {
    if (error instanceof ApiError && error.code === "EXTRACURRICULAR_MEMBER_REQUIRED") { sendData(res,{student,needs_enrollment:true}); return; }
    throw error;
  }
}));

router.get("/:id/sessions/:sessionId/summary", requirePermission("extracurricular.read"), validate({ params: sessionParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_attendance").select("status")
    .eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id).eq("session_id", req.params.sessionId);
  if (error) throw fromDatabaseError(error);
  const summary = { total: data?.length ?? 0, present: 0, excused: 0, absent: 0 };
  for (const row of data ?? []) summary[row.status.toLowerCase() as "present" | "excused" | "absent"]++;
  sendData(res, summary);
}));

router.get("/:id/sessions/:sessionId/attendance", requirePermission("extracurricular.read"), validate({ params: sessionParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("extracurricular_attendance")
    .select("id,student_id,status,notes,recorded_at,extracurricular_members(students(full_name,student_number))")
    .eq("school_id", req.tenant!.schoolId).eq("extracurricular_id", req.params.id).eq("session_id", req.params.sessionId)
    .order("recorded_at", { ascending: false });
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

export { router as extracurricularsRouter };
