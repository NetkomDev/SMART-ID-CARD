import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { createAcademicYearSchema, switchAcademicYearSchema, updateAcademicYearSchema } from "../schemas/academic-year.js";
import { idParamsSchema } from "../schemas/common.js";

const router = Router();
const selection = "id, school_id, name, start_date, end_date, is_active, created_at, updated_at";

router.get("/", asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("academic_years").select(selection)
    .eq("school_id", req.tenant!.schoolId).is("deleted_at", null).order("start_date", { ascending: false });
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.post("/switch", requirePermission("academic.manage"), validate({ body: switchAcademicYearSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("switch_academic_year", {
    target_school_id: req.tenant!.schoolId,
    target_academic_year_id: req.body.academic_year_id
  });
  if (error?.code === "P0002") throw new ApiError(404, "ACADEMIC_YEAR_NOT_FOUND", "Academic year was not found");
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

router.get("/:id", validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("academic_years").select(selection)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "ACADEMIC_YEAR_NOT_FOUND", "Academic year was not found");
  sendData(res, data);
}));

router.post("/", requirePermission("academic.manage"), validate({ body: createAcademicYearSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("academic_years")
    .insert({ ...req.body, school_id: req.tenant!.schoolId, is_active: false }).select(selection).single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.patch("/:id", requirePermission("academic.manage"), validate({ params: idParamsSchema, body: updateAcademicYearSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("academic_years").update(req.body)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).select(selection).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "ACADEMIC_YEAR_NOT_FOUND", "Academic year was not found");
  sendData(res, data);
}));

router.delete("/:id", requirePermission("academic.manage"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("academic_years")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).eq("is_active", false)
    .is("deleted_at", null).select("id").maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) {
    const { data: existing, error: lookupError } = await req.auth!.client.from("academic_years").select("id")
      .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).maybeSingle();
    if (lookupError) throw fromDatabaseError(lookupError);
    if (!existing) throw new ApiError(404, "ACADEMIC_YEAR_NOT_FOUND", "Academic year was not found");
    throw new ApiError(409, "CONFLICT", "Active academic year cannot be deleted; switch periods first");
  }
  res.status(204).send();
}));

export { router as academicYearsRouter };
