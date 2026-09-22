import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { createStudentHistorySchema } from "../schemas/student-history.js";

const router = Router({ mergeParams: true });
const selection = "id, school_id, student_id, class_id, academic_year_id, start_date, end_date, is_current, created_at, updated_at, classes(id, code, name), academic_years(id, name)";

router.get("/", requirePermission("student.read"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data: student, error: studentError } = await req.auth!.client.from("students").select("id")
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).maybeSingle();
  if (studentError) throw fromDatabaseError(studentError);
  if (!student) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found");

  const { data, error } = await req.auth!.client.from("student_class_history").select(selection)
    .eq("school_id", req.tenant!.schoolId).eq("student_id", req.params.id)
    .order("start_date", { ascending: false });
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.post("/", requirePermission("student.update"), validate({ params: idParamsSchema, body: createStudentHistorySchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("record_student_class_history", {
    target_school_id: req.tenant!.schoolId,
    target_student_id: req.params.id,
    target_class_id: req.body.class_id,
    target_academic_year_id: req.body.academic_year_id,
    effective_start_date: req.body.start_date
  });
  if (error?.code === "P0002") throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found");
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

export { router as studentHistoryRouter };
