import { Router } from "express";
import { z } from "zod";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { createStudentSchema, updateStudentSchema } from "../schemas/student.js";

const router = Router();
const selection = "id, school_id, nisn, student_number, full_name, gender, date_of_birth, pob, address, photo_url, is_active, created_at, updated_at, student_class_history(class_id, is_current, classes(id, name, code))";

const studentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().min(1).max(100)
    .regex(/^[\p{L}\p{N}\s.-]+$/u, "Search contains unsupported characters")
    .optional(),
  class_id: z.string().uuid().optional()
}).strict();

router.get("/", requirePermission("student.read"), validate({ query: studentQuerySchema }), asyncHandler(async (req, res) => {
  const { page, page_size: pageSize, search, class_id } = req.query as unknown as { page: number; page_size: number; search?: string; class_id?: string };
  
  let targetStudentIds: string[] | null = null;
  if (class_id) {
    const { data: historyRows, error: historyError } = await req.auth!.client.from("student_class_history")
      .select("student_id")
      .eq("school_id", req.tenant!.schoolId)
      .eq("class_id", class_id)
      .eq("is_current", true);
    if (historyError) throw fromDatabaseError(historyError);
    targetStudentIds = (historyRows ?? []).map(r => r.student_id);
  }

  let query = req.auth!.client.from("students").select(selection, { count: "exact" })
    .eq("school_id", req.tenant!.schoolId).is("deleted_at", null);

  if (targetStudentIds !== null) {
    query = query.in("id", targetStudentIds.length > 0 ? targetStudentIds : ["00000000-0000-0000-0000-000000000000"]);
  }

  if (search) query = query.or(`full_name.ilike.%${search}%,student_number.ilike.%${search}%,nisn.ilike.%${search}%`);

  query = query.range((page - 1) * pageSize, page * pageSize - 1).order("full_name");

  const { data, error, count } = await query;
  if (error) throw fromDatabaseError(error);

  const formattedData = (data ?? []).map((item: any) => {
    const histories = Array.isArray(item.student_class_history) ? item.student_class_history : (item.student_class_history ? [item.student_class_history] : []);
    const currentHistory = histories.find((h: any) => h.is_current) || histories[0];
    const className = currentHistory?.classes?.name ?? null;
    const itemClassId = currentHistory?.class_id ?? null;
    const { student_class_history, ...rest } = item;
    return {
      ...rest,
      class_id: itemClassId,
      class_name: className
    };
  });

  sendData(res, formattedData, 200, { page, page_size: pageSize, total: count ?? 0 });
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

