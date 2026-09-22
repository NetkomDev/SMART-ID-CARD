import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema, paginationSchema } from "../schemas/common.js";
import { createStudentSchema, updateStudentSchema } from "../schemas/student.js";

const router = Router();
const selection = "id, school_id, nisn, student_number, full_name, gender, date_of_birth, is_active, created_at, updated_at";

router.get("/", requirePermission("student.read"), validate({ query: paginationSchema }), asyncHandler(async (req, res) => {
  const { page, page_size: pageSize, search } = req.query as unknown as { page: number; page_size: number; search?: string };
  let query = req.auth!.client.from("students").select(selection, { count: "exact" })
    .eq("school_id", req.tenant!.schoolId).is("deleted_at", null)
    .range((page - 1) * pageSize, page * pageSize - 1).order("full_name");
  if (search) query = query.or(`full_name.ilike.%${search}%,student_number.ilike.%${search}%,nisn.ilike.%${search}%`);
  const { data, error, count } = await query;
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? [], 200, { page, page_size: pageSize, total: count ?? 0 });
}));

router.get("/:id", requirePermission("student.read"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("students").select(selection)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found");
  sendData(res, data);
}));

router.post("/", requirePermission("student.create"), validate({ body: createStudentSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("students")
    .insert({ ...req.body, school_id: req.tenant!.schoolId }).select(selection).single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.patch("/:id", requirePermission("student.update"), validate({ params: idParamsSchema, body: updateStudentSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("students").update(req.body)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).select(selection).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found");
  sendData(res, data);
}));

router.delete("/:id", requirePermission("student.update"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("students")
    .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_by: req.auth!.user.id })
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found");
  res.status(204).send();
}));

export { router as studentsRouter };
