import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireRole } from "../middleware/tenant.js";

const router = Router();

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
    .select("id, code, name, status, timezone, waste_start_time, waste_end_time, is_active, created_at, updated_at")
    .eq("id", req.tenant!.schoolId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "SCHOOL_NOT_FOUND", "School was not found");
  sendData(res, data);
}));

router.patch("/current", requireRole("SCHOOL_ADMIN"), asyncHandler(async (req, res) => {
  const { waste_start_time, waste_end_time } = req.body;
  const { data, error } = await req.auth!.client
    .from("schools")
    .update({ waste_start_time: waste_start_time || null, waste_end_time: waste_end_time || null })
    .eq("id", req.tenant!.schoolId)
    .select("waste_start_time, waste_end_time")
    .single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

export { router as schoolsRouter };
