import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireRole } from "../middleware/tenant.js";

const router = Router();

const schoolColumns = "id, code, name, status, timezone, waste_start_time, waste_end_time, waste_organic_points_per_kg, waste_inorganic_points_per_kg, is_active, created_at, updated_at";
const coreSchoolColumns = "id, code, name, status, timezone, is_active, created_at, updated_at";

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

router.get("/current/context", (req, res) => {
  sendData(res, {
    school_id: req.tenant!.schoolId,
    membership_id: req.tenant!.membershipId,
    roles: req.tenant!.roles,
    permissions: req.tenant!.permissions
  });
});

router.get("/current", asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client
    .from("schools")
    .select(schoolColumns)
    .eq("id", req.tenant!.schoolId)
    .maybeSingle();
  if (error) {
    if (!isMissingColumn(error)) throw fromDatabaseError(error);
    const fallback = await req.auth!.client
      .from("schools")
      .select(coreSchoolColumns)
      .eq("id", req.tenant!.schoolId)
      .maybeSingle();
    if (fallback.error) throw fromDatabaseError(fallback.error);
    if (!fallback.data) throw new ApiError(404, "SCHOOL_NOT_FOUND", "School was not found");
    sendData(res, {
      ...fallback.data,
      waste_start_time: null,
      waste_end_time: null,
      waste_organic_points_per_kg: null,
      waste_inorganic_points_per_kg: null
    });
    return;
  }
  if (!data) throw new ApiError(404, "SCHOOL_NOT_FOUND", "School was not found");
  sendData(res, data);
}));

const wasteSettings = z.object({
  waste_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).nullable().optional(),
  waste_end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).nullable().optional(),
  waste_organic_points_per_kg: z.number().min(0).max(10000).nullable().optional(),
  waste_inorganic_points_per_kg: z.number().min(0).max(10000).nullable().optional()
}).strict().refine(value => Object.keys(value).length > 0, "Pengaturan tidak boleh kosong");
router.patch("/current", requireRole("SCHOOL_ADMIN"), validate({ body: wasteSettings }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client
    .from("schools")
    .update(req.body)
    .eq("id", req.tenant!.schoolId)
    .select("waste_start_time, waste_end_time, waste_organic_points_per_kg, waste_inorganic_points_per_kg")
    .single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

export { router as schoolsRouter };
