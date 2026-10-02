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
    .range((page - 1) * pageSize, page * pageSize - 1)
    .order("grade_level", { ascending: true })
    .order("name", { ascending: true });
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  const { data, error, count } = await query;
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? [], 200, { page, page_size: pageSize, total: count ?? 0 });
}));

router.get("/summary", asyncHandler(async (req, res) => {
  const { data: classes, error: classError } = await req.auth!.client.from("classes")
    .select("id, name, grade_level").eq("school_id", req.tenant!.schoolId).is("deleted_at", null)
    .order("grade_level", { ascending: true })
    .order("name", { ascending: true });
  if (classError) throw fromDatabaseError(classError);

  const { data: counts, error: countError } = await req.auth!.client.from("student_class_history")
    .select("class_id").eq("school_id", req.tenant!.schoolId).eq("is_current", true);
  if (countError) throw fromDatabaseError(countError);

  const countMap = new Map<string, number>();
  for (const row of counts ?? []) {
    countMap.set(row.class_id, (countMap.get(row.class_id) ?? 0) + 1);
  }

  const sortedClasses = [...(classes ?? [])].sort((a, b) => {
    const gA = a.grade_level ?? 0;
    const gB = b.grade_level ?? 0;
    if (gA !== gB) return gA - gB;
    return a.name.localeCompare(b.name, "id", { numeric: true, sensitivity: "base" });
  });

  sendData(res, sortedClasses.map(c => ({ ...c, student_count: countMap.get(c.id) ?? 0 })));
}));

router.get("/:id", validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("classes").select(selection)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CLASS_NOT_FOUND", "Class was not found");
  sendData(res, data);
}));

router.post("/", requirePermission("academic.manage"), validate({ body: createClassSchema }), asyncHandler(async (req, res) => {
  const schoolId = req.tenant!.schoolId;
  const { code, name, academic_year_id, grade_level, homeroom_teacher_user_id } = req.body;

  const safeCode = String(code).replace(/"/g, '""');
  const safeName = String(name).replace(/"/g, '""');

  // 1. Check if an active class already exists with the same code or name in this academic year
  const { data: activeClass } = await req.auth!.client
    .from("classes")
    .select(selection)
    .eq("school_id", schoolId)
    .eq("academic_year_id", academic_year_id)
    .is("deleted_at", null)
    .or(`code.ilike."${safeCode}",name.ilike."${safeName}"`)
    .maybeSingle();

  if (activeClass) {
    throw new ApiError(409, "CONFLICT", `Kelas "${activeClass.name}" sudah ada.`);
  }

  // 2. Check if a soft-deleted class exists with the same code or name
  const { data: softDeleted } = await req.auth!.client
    .from("classes")
    .select(selection)
    .eq("school_id", schoolId)
    .not("deleted_at", "is", null)
    .or(`code.ilike."${safeCode}",name.ilike."${safeName}"`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (softDeleted) {
    const { data: restored, error: restoreErr } = await req.auth!.client
      .from("classes")
      .update({
        code,
        name,
        academic_year_id,
        grade_level: grade_level ?? softDeleted.grade_level,
        homeroom_teacher_user_id: homeroom_teacher_user_id ?? softDeleted.homeroom_teacher_user_id,
        is_active: true,
        deleted_at: null
      })
      .eq("id", softDeleted.id)
      .select(selection)
      .single();

    if (restoreErr) throw fromDatabaseError(restoreErr);
    return sendData(res, restored, 201);
  }

  // 3. Normal insert
  const { data, error } = await req.auth!.client.from("classes")
    .insert({ ...req.body, school_id: schoolId }).select(selection).single();

  if (error?.code === "23505") {
    // Unique violation fallback: find soft-deleted record by code or name
    const { data: softDeletedFallback } = await req.auth!.client
      .from("classes")
      .select(selection)
      .eq("school_id", schoolId)
      .not("deleted_at", "is", null)
      .or(`code.ilike."${safeCode}",name.ilike."${safeName}"`)
      .limit(1)
      .maybeSingle();

    if (softDeletedFallback) {
      const { data: restored, error: restoreErr } = await req.auth!.client
        .from("classes")
        .update({
          code,
          name,
          academic_year_id,
          grade_level: grade_level ?? softDeletedFallback.grade_level,
          homeroom_teacher_user_id: homeroom_teacher_user_id ?? softDeletedFallback.homeroom_teacher_user_id,
          is_active: true,
          deleted_at: null
        })
        .eq("id", softDeletedFallback.id)
        .select(selection)
        .single();
      if (restoreErr) throw fromDatabaseError(restoreErr);
      return sendData(res, restored, 201);
    }
  }

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
  const schoolId = req.tenant!.schoolId;
  const classId = req.params.id;

  const { data: targetClass, error: findErr } = await req.auth!.client
    .from("classes")
    .select("id")
    .eq("school_id", schoolId)
    .eq("id", classId)
    .is("deleted_at", null)
    .maybeSingle();

  if (findErr) throw fromDatabaseError(findErr);
  if (!targetClass) throw new ApiError(404, "CLASS_NOT_FOUND", "Class was not found");

  // Check if any student_class_history references this class
  const { count: historyCount } = await req.auth!.client
    .from("student_class_history")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("class_id", classId);

  if (!historyCount || historyCount === 0) {
    // Attempt hard delete if no students linked
    const { error: deleteErr } = await req.auth!.client
      .from("classes")
      .delete()
      .eq("school_id", schoolId)
      .eq("id", classId);

    if (!deleteErr) {
      return res.status(204).send();
    }
  }

  // Soft delete fallback
  const { data, error } = await req.auth!.client.from("classes")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("school_id", schoolId).eq("id", classId).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw fromDatabaseError(error);
  res.status(204).send();
}));

export { router as classesRouter };
