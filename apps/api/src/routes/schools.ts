import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/current", asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client
    .from("schools")
    .select("id, code, name, status, timezone, is_active, created_at, updated_at")
    .eq("id", req.tenant!.schoolId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "SCHOOL_NOT_FOUND", "School was not found");
  sendData(res, data);
}));

export { router as schoolsRouter };
