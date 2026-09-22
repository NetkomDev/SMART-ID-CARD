import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { createClassSchema, updateClassSchema } from "../schemas/class.js";
import { idParamsSchema, paginationSchema } from "../schemas/common.js";

const router = Router();
const selection = "id, school_id, academic_year_id, code, name, grade_level, homeroom_teacher_user_id, is_active, created_at, updated_at";

router.get("/", validate({ query: paginationSchema }), asyncHandler(async (req, res) => {
  const { page, page_size: pageSize, search } = req.query as unknown as { page: number; page_size: number; search?: string };
  let query = req.auth!.client.from("classes").select(selection, { count: "exact" })
    .eq("school_id", req.tenant!.schoolId).is("deleted_at", null)
    .range((page - 1) * pageSize, page * pageSize - 1).order("name");
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  const { data, error, count } = await query;
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? [], 200, { page, page_size: pageSize, total: count ?? 0 });
}));

router.get("/:id", validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("classes").select(selection)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CLASS_NOT_FOUND", "Class was not found");
  sendData(res, data);
}));

router.post("/", requirePermission("academic.manage"), validate({ body: createClassSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("classes")
    .insert({ ...req.body, school_id: req.tenant!.schoolId }).select(selection).single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.patch("/:id", requirePermission("academic.manage"), validate({ params: idParamsSchema, body: updateClassSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("classes").update(req.body)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).select(selection).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CLASS_NOT_FOUND", "Class was not found");
  sendData(res, data);
}));

router.delete("/:id", requirePermission("academic.manage"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("classes")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CLASS_NOT_FOUND", "Class was not found");
  res.status(204).send();
}));

export { router as classesRouter };
