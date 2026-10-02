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
  const { class_id, class_name, ...studentBody } = req.body as any;
  const schoolId = req.tenant!.schoolId;

  const { data: student, error } = await req.auth!.client.from("students")
    .insert({ ...studentBody, school_id: schoolId }).select("id").single();
  if (error) throw fromDatabaseError(error);

  let targetClassId: string | null = class_id ?? null;

  if (!targetClassId && class_name && typeof class_name === "string" && class_name.trim().length > 0) {
    const trimmedClassName = class_name.trim();

    // 1. Find active matching class
    const { data: activeClass } = await req.auth!.client
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .or(`name.ilike.${trimmedClassName},code.ilike.${trimmedClassName}`)
      .limit(1)
      .maybeSingle();

    if (activeClass) {
      targetClassId = activeClass.id;
    } else {
      // 2. Find soft-deleted class and reactivate
      const { data: softDeletedClass } = await req.auth!.client
        .from("classes")
        .select("id")
        .eq("school_id", schoolId)
        .not("deleted_at", "is", null)
        .or(`name.ilike.${trimmedClassName},code.ilike.${trimmedClassName}`)
        .limit(1)
        .maybeSingle();

      if (softDeletedClass) {
        await req.auth!.client
          .from("classes")
          .update({ is_active: true, deleted_at: null })
          .eq("id", softDeletedClass.id);
        targetClassId = softDeletedClass.id;
      } else {
        // 3. Create a new class under active academic year
        const { data: activeYear } = await req.auth!.client
          .from("academic_years")
          .select("id")
          .eq("school_id", schoolId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeYear) {
          let gradeLevel: number | null = null;
          const upper = trimmedClassName.toUpperCase();
          if (upper.includes("XII") || upper.includes("12")) gradeLevel = 12;
          else if (upper.includes("XI") || upper.includes("11")) gradeLevel = 11;
          else if (upper.includes("X") || upper.includes("10")) gradeLevel = 10;
          else if (upper.includes("IX") || upper.includes("9")) gradeLevel = 9;
          else if (upper.includes("VIII") || upper.includes("8")) gradeLevel = 8;
          else if (upper.includes("VII") || upper.includes("7")) gradeLevel = 7;
          else if (upper.includes("6") || upper.includes("VI")) gradeLevel = 6;
          else if (upper.includes("5") || upper.includes("V")) gradeLevel = 5;
          else if (upper.includes("4") || upper.includes("IV")) gradeLevel = 4;
          else if (upper.includes("3") || upper.includes("III")) gradeLevel = 3;
          else if (upper.includes("2") || upper.includes("II")) gradeLevel = 2;
          else if (upper.includes("1") || upper.includes("I")) gradeLevel = 1;

          const classCode = trimmedClassName.toLowerCase().replace(/\s+/g, "-");

          const { data: newClass } = await req.auth!.client
            .from("classes")
            .insert({
              school_id: schoolId,
              academic_year_id: activeYear.id,
              code: classCode,
              name: trimmedClassName,
              grade_level: gradeLevel,
              is_active: true
            })
            .select("id")
            .single();

          if (newClass) {
            targetClassId = newClass.id;
          }
        }
      }
    }
  }

  // Create student_class_history if targetClassId exists
  if (targetClassId) {
    const { data: activeYear } = await req.auth!.client
      .from("academic_years")
      .select("id")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeYear) {
      await req.auth!.client.from("student_class_history").insert({
        school_id: schoolId,
        student_id: student.id,
        class_id: targetClassId,
        academic_year_id: activeYear.id,
        is_current: true,
        start_date: new Date().toISOString().split("T")[0]
      });
    }
  }

  // Re-fetch student with selection
  const { data: fullStudent, error: fetchErr } = await req.auth!.client.from("students")
    .select(selection).eq("school_id", schoolId).eq("id", student.id).single();

  if (fetchErr || !fullStudent) throw fromDatabaseError(fetchErr || error);

  const histories = Array.isArray(fullStudent.student_class_history) ? fullStudent.student_class_history : (fullStudent.student_class_history ? [fullStudent.student_class_history] : []);
  const currentHistory = histories.find((h: any) => h.is_current) || histories[0];
  const rawClasses = currentHistory?.classes as any;
  const resolvedClassName = Array.isArray(rawClasses) ? rawClasses[0]?.name ?? null : rawClasses?.name ?? null;
  const itemClassId = currentHistory?.class_id ?? null;
  const { student_class_history, ...rest } = fullStudent;

  sendData(res, { ...rest, class_id: itemClassId, class_name: resolvedClassName }, 201);
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

