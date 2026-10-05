import { Router } from "express";
import { z } from "zod";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { batchStudentImportSchema, createStudentSchema, updateStudentSchema } from "../schemas/student.js";

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
  
  const currentSelection = class_id 
    ? selection.replace("student_class_history(", "student_class_history!inner(") 
    : selection;

  let query = req.auth!.client.from("students").select(currentSelection, { count: "exact" })
    .eq("school_id", req.tenant!.schoolId).is("deleted_at", null);

  if (class_id) {
    query = query
      .eq("student_class_history.class_id", class_id)
      .eq("student_class_history.is_current", true);
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

async function resolveClassId(client: any, schoolId: string, classId?: string | null, className?: string | null): Promise<string | null> {
  if (classId) return classId;
  if (!className || typeof className !== "string" || !className.trim()) return null;

  const trimmed = className.trim();
  const classCode = trimmed.toLowerCase().replace(/\s+/g, "-");
  const safeName = trimmed.replace(/"/g, '""');
  const safeCode = classCode.replace(/"/g, '""');

  // 1. Find active class
  const { data: activeClass } = await client
    .from("classes")
    .select("id")
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .or(`name.ilike."${safeName}",code.ilike."${safeName}",code.ilike."${safeCode}"`)
    .limit(1)
    .maybeSingle();

  if (activeClass) return activeClass.id;

  // 2. Find soft-deleted class and restore
  const { data: softDeletedClass } = await client
    .from("classes")
    .select("id")
    .eq("school_id", schoolId)
    .not("deleted_at", "is", null)
    .or(`name.ilike."${safeName}",code.ilike."${safeName}",code.ilike."${safeCode}"`)
    .limit(1)
    .maybeSingle();

  if (softDeletedClass) {
    await client
      .from("classes")
      .update({ is_active: true, deleted_at: null })
      .eq("id", softDeletedClass.id);
    return softDeletedClass.id;
  }

  // 3. Create new class under active academic year
  let { data: activeYear } = await client
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeYear) {
    const { data: latestYear } = await client
      .from("academic_years")
      .select("id")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    activeYear = latestYear;
  }

  if (!activeYear) return null;

  let gradeLevel: number | null = null;
  const upper = trimmed.toUpperCase();
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

  const { data: newClass, error: createErr } = await client
    .from("classes")
    .insert({
      school_id: schoolId,
      academic_year_id: activeYear.id,
      code: classCode,
      name: trimmed,
      grade_level: gradeLevel,
      is_active: true
    })
    .select("id")
    .single();

  if (newClass) return newClass.id;

  if (createErr?.code === "23505") {
    const { data: softDeletedFallback } = await client
      .from("classes")
      .select("id")
      .eq("school_id", schoolId)
      .not("deleted_at", "is", null)
      .or(`name.ilike."${safeName}",code.ilike."${safeName}",code.ilike."${safeCode}"`)
      .limit(1)
      .maybeSingle();

    if (softDeletedFallback) {
      await client
        .from("classes")
        .update({ is_active: true, deleted_at: null })
        .eq("id", softDeletedFallback.id);
      return softDeletedFallback.id;
    }
  }

  return null;
}

async function assignStudentClass(client: any, schoolId: string, studentId: string, classId: string) {
  let { data: activeYear } = await client
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeYear) {
    const { data: latestYear } = await client
      .from("academic_years")
      .select("id")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    activeYear = latestYear;
  }

  if (!activeYear) return;

  const { data: currentHistory } = await client
    .from("student_class_history")
    .select("id, class_id, academic_year_id")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("is_current", true)
    .maybeSingle();

  if (currentHistory && currentHistory.class_id === classId && currentHistory.academic_year_id === activeYear.id) {
    return;
  }

  await client.from("student_class_history")
    .update({ is_current: false })
    .eq("school_id", schoolId)
    .eq("student_id", studentId);

  const todayStr = new Date().toISOString().split("T")[0];

  const { data: existingHistory } = await client
    .from("student_class_history")
    .select("id")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("academic_year_id", activeYear.id)
    .eq("class_id", classId)
    .eq("start_date", todayStr)
    .maybeSingle();

  if (existingHistory) {
    await client
      .from("student_class_history")
      .update({ is_current: true, end_date: null })
      .eq("id", existingHistory.id);
  } else {
    await client.from("student_class_history").insert({
      school_id: schoolId,
      student_id: studentId,
      class_id: classId,
      academic_year_id: activeYear.id,
      is_current: true,
      start_date: todayStr
    });
  }
}

function formatStudentResponse(fullStudent: any) {
  const histories = Array.isArray(fullStudent.student_class_history) ? fullStudent.student_class_history : (fullStudent.student_class_history ? [fullStudent.student_class_history] : []);
  const currentHistory = histories.find((h: any) => h.is_current) || histories[0];
  const rawClasses = currentHistory?.classes as any;
  const resolvedClassName = Array.isArray(rawClasses) ? rawClasses[0]?.name ?? null : rawClasses?.name ?? null;
  const itemClassId = currentHistory?.class_id ?? null;
  const { student_class_history, ...rest } = fullStudent;
  return { ...rest, class_id: itemClassId, class_name: resolvedClassName };
}

const checkExistingSchema = z.object({
  nisns: z.array(z.string()).optional(),
  student_numbers: z.array(z.string()).optional()
});

router.post("/check-existing", requirePermission("student.read"), validate({ body: checkExistingSchema }), asyncHandler(async (req, res) => {
  const { nisns = [], student_numbers = [] } = req.body as { nisns?: string[]; student_numbers?: string[] };
  const schoolId = req.tenant!.schoolId;

  const validNisns = nisns.filter(n => typeof n === "string" && n.trim().length > 0);
  const validNumbers = student_numbers.filter(n => typeof n === "string" && n.trim().length > 0);

  if (validNisns.length === 0 && validNumbers.length === 0) {
    sendData(res, { existing: [] });
    return;
  }

  const filters: string[] = [];
  if (validNisns.length > 0) {
    filters.push(`nisn.in.(${validNisns.map(n => `"${n.replace(/"/g, '""')}"`).join(",")})`);
  }
  if (validNumbers.length > 0) {
    filters.push(`student_number.in.(${validNumbers.map(n => `"${n.replace(/"/g, '""')}"`).join(",")})`);
  }

  const { data, error } = await req.auth!.client
    .from("students")
    .select("id, nisn, student_number, full_name")
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .or(filters.join(","));

  if (error) throw fromDatabaseError(error);
  sendData(res, { existing: data ?? [] });
}));

router.post("/batch", requirePermission("student.create"), validate({ body: batchStudentImportSchema }), asyncHandler(async (req, res) => {
  const { students, overwrite } = req.body as { students: any[]; overwrite: boolean };
  const schoolId = req.tenant!.schoolId;

  if (students.length === 0) {
    sendData(res, { success: true, inserted: 0, updated: 0, skipped: 0, total: 0 });
    return;
  }

  const classIdCache = new Map<string, string | null>();
  const getClassId = async (cId?: string | null, cName?: string | null) => {
    const key = `${cId || ''}:${cName || ''}`;
    if (classIdCache.has(key)) return classIdCache.get(key)!;
    const resId = await resolveClassId(req.auth!.client, schoolId, cId, cName);
    classIdCache.set(key, resId);
    return resId;
  };

  const cleanedList = students.map((s, idx) => {
    const cleanNisn = (typeof s.nisn === "string" && s.nisn.trim().length > 0) ? s.nisn.trim() : null;
    const cleanStudentNumber = (typeof s.student_number === "string" && s.student_number.trim().length > 0)
      ? s.student_number.trim()
      : (cleanNisn || `STD-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`);
    return {
      ...s,
      nisn: cleanNisn,
      student_number: cleanStudentNumber
    };
  });

  const nisns = cleanedList.map(s => s.nisn).filter(Boolean) as string[];
  const numbers = cleanedList.map(s => s.student_number).filter(Boolean) as string[];

  const filters: string[] = [];
  if (nisns.length > 0) filters.push(`nisn.in.(${nisns.map(n => `"${n.replace(/"/g, '""')}"`).join(",")})`);
  if (numbers.length > 0) filters.push(`student_number.in.(${numbers.map(n => `"${n.replace(/"/g, '""')}"`).join(",")})`);

  let existingStudentsMap = new Map<string, any>();
  if (filters.length > 0) {
    const { data: existingData, error: checkErr } = await req.auth!.client
      .from("students")
      .select("id, nisn, student_number")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .or(filters.join(","));

    if (checkErr) throw fromDatabaseError(checkErr);
    (existingData || []).forEach((e: any) => {
      if (e.nisn) existingStudentsMap.set(`nisn:${String(e.nisn).trim().toLowerCase()}`, e);
      if (e.student_number) existingStudentsMap.set(`num:${String(e.student_number).trim().toLowerCase()}`, e);
    });
  }

  const toInsert: any[] = [];
  const toUpdate: Array<{ existingId: string; data: any; classId?: string | null }> = [];
  let skipped = 0;

  for (const item of cleanedList) {
    const keyNisn = item.nisn ? `nisn:${item.nisn.toLowerCase()}` : null;
    const keyNum = item.student_number ? `num:${item.student_number.toLowerCase()}` : null;
    const existing = (keyNisn && existingStudentsMap.get(keyNisn)) || (keyNum && existingStudentsMap.get(keyNum));

    const targetClassId = await getClassId(item.class_id, item.class_name);
    const { class_id, class_name, ...dbData } = item;

    if (existing) {
      if (overwrite) {
        toUpdate.push({ existingId: existing.id, data: dbData, classId: targetClassId });
      } else {
        skipped++;
        if (targetClassId) {
          await assignStudentClass(req.auth!.client, schoolId, existing.id, targetClassId);
        }
      }
    } else {
      toInsert.push({ ...dbData, school_id: schoolId, targetClassId });
    }
  }

  let insertedCount = 0;
  let updatedCount = 0;

  if (toInsert.length > 0) {
    const insertPayload = toInsert.map(({ targetClassId, ...rest }) => rest);
    const { data: insertedData, error: insertErr } = await req.auth!.client
      .from("students")
      .insert(insertPayload)
      .select("id, nisn, student_number");

    if (insertErr) throw fromDatabaseError(insertErr);

    insertedCount = insertedData?.length ?? toInsert.length;

    if (insertedData) {
      const assignPromises = insertedData.map(async (insertedItem: any, idx: number) => {
        const targetClassId = toInsert[idx]?.targetClassId;
        if (targetClassId) {
          await assignStudentClass(req.auth!.client, schoolId, insertedItem.id, targetClassId);
        }
      });
      await Promise.all(assignPromises);
    }
  }

  if (toUpdate.length > 0) {
    const updatePromises = toUpdate.map(async (u) => {
      const { error: updErr } = await req.auth!.client
        .from("students")
        .update(u.data)
        .eq("school_id", schoolId)
        .eq("id", u.existingId);
      if (updErr) throw fromDatabaseError(updErr);

      if (u.classId) {
        await assignStudentClass(req.auth!.client, schoolId, u.existingId, u.classId);
      }
    });

    await Promise.all(updatePromises);
    updatedCount = toUpdate.length;
  }

  sendData(res, {
    success: true,
    inserted: insertedCount,
    updated: updatedCount,
    skipped,
    total: students.length
  }, 200);
}));

router.post("/", requirePermission("student.create"), validate({ body: createStudentSchema }), asyncHandler(async (req, res) => {
  const { class_id, class_name, overwrite, skip_if_exists, ...rawStudentBody } = req.body as any;
  const schoolId = req.tenant!.schoolId;

  // Clean NISN and student_number
  const cleanNisn = (typeof rawStudentBody.nisn === "string" && rawStudentBody.nisn.trim().length > 0)
    ? rawStudentBody.nisn.trim()
    : null;

  const cleanStudentNumber = (typeof rawStudentBody.student_number === "string" && rawStudentBody.student_number.trim().length > 0)
    ? rawStudentBody.student_number.trim()
    : (cleanNisn || `STD-${Date.now()}-${Math.floor(Math.random() * 1000)}`);

  const studentBody = {
    ...rawStudentBody,
    nisn: cleanNisn,
    student_number: cleanStudentNumber
  };

  // Search for existing student by NISN or student_number
  const searchConditions: string[] = [];
  if (studentBody.nisn) {
    searchConditions.push(`nisn.eq."${studentBody.nisn.replace(/"/g, '""')}"`);
  }
  if (studentBody.student_number) {
    searchConditions.push(`student_number.eq."${studentBody.student_number.replace(/"/g, '""')}"`);
  }

  let existingStudent: any = null;
  if (searchConditions.length > 0) {
    const { data } = await req.auth!.client
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .is("deleted_at", null)
      .or(searchConditions.join(","))
      .maybeSingle();
    existingStudent = data;
  }

  if (existingStudent) {
    if (overwrite) {
      const { error: updateErr } = await req.auth!.client
        .from("students")
        .update(studentBody)
        .eq("school_id", schoolId)
        .eq("id", existingStudent.id);
      if (updateErr) throw fromDatabaseError(updateErr);

      const targetClassId = await resolveClassId(req.auth!.client, schoolId, class_id, class_name);
      if (targetClassId) {
        await assignStudentClass(req.auth!.client, schoolId, existingStudent.id, targetClassId);
      }

      const { data: fullStudent, error: fetchErr } = await req.auth!.client
        .from("students")
        .select(selection)
        .eq("school_id", schoolId)
        .eq("id", existingStudent.id)
        .single();
      if (fetchErr || !fullStudent) throw fromDatabaseError(fetchErr);
      sendData(res, formatStudentResponse(fullStudent), 200);
      return;
    } else {
      // Keep existing data, assign class if requested
      const targetClassId = await resolveClassId(req.auth!.client, schoolId, class_id, class_name);
      if (targetClassId) {
        await assignStudentClass(req.auth!.client, schoolId, existingStudent.id, targetClassId);
      }

      const { data: fullStudent, error: fetchErr } = await req.auth!.client
        .from("students")
        .select(selection)
        .eq("school_id", schoolId)
        .eq("id", existingStudent.id)
        .single();
      if (fetchErr || !fullStudent) throw fromDatabaseError(fetchErr);
      sendData(res, formatStudentResponse(fullStudent), 200);
      return;
    }
  }

  // Insert new student
  const { data: student, error } = await req.auth!.client.from("students")
    .insert({ ...studentBody, school_id: schoolId }).select("id").single();
  
  if (error) {
    if (error.code === "23505" && searchConditions.length > 0) {
      const { data: fallbackExisting } = await req.auth!.client
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .is("deleted_at", null)
        .or(searchConditions.join(","))
        .maybeSingle();

      if (fallbackExisting) {
        if (overwrite) {
          await req.auth!.client.from("students").update(studentBody).eq("id", fallbackExisting.id);
        }
        const targetClassId = await resolveClassId(req.auth!.client, schoolId, class_id, class_name);
        if (targetClassId) await assignStudentClass(req.auth!.client, schoolId, fallbackExisting.id, targetClassId);

        const { data: fullStudent } = await req.auth!.client.from("students").select(selection).eq("id", fallbackExisting.id).single();
        sendData(res, formatStudentResponse(fullStudent), 200);
        return;
      }
    }
    throw fromDatabaseError(error);
  }

  const targetClassId = await resolveClassId(req.auth!.client, schoolId, class_id, class_name);
  if (targetClassId) {
    await assignStudentClass(req.auth!.client, schoolId, student.id, targetClassId);
  }

  const { data: fullStudent, error: fetchErr } = await req.auth!.client.from("students")
    .select(selection).eq("school_id", schoolId).eq("id", student.id).single();

  if (fetchErr || !fullStudent) throw fromDatabaseError(fetchErr || error);
  sendData(res, formatStudentResponse(fullStudent), 201);
}));

router.patch("/:id", requirePermission("student.update"), validate({ params: idParamsSchema, body: updateStudentSchema }), asyncHandler(async (req, res) => {
  const { class_id, class_name, ...studentBody } = req.body as any;
  const schoolId = req.tenant!.schoolId;
  const studentId = req.params.id as string;

  if (class_id !== undefined || class_name !== undefined) {
    const targetClassId = await resolveClassId(req.auth!.client, schoolId, class_id, class_name);
    if (targetClassId) {
      await assignStudentClass(req.auth!.client, schoolId, studentId, targetClassId);
    }
  }

  if (Object.keys(studentBody).length > 0) {
    if (studentBody.nisn !== undefined) {
      studentBody.nisn = (typeof studentBody.nisn === "string" && studentBody.nisn.trim().length > 0)
        ? studentBody.nisn.trim()
        : null;
    }
    const { error: updateErr } = await req.auth!.client.from("students").update(studentBody)
      .eq("school_id", schoolId).eq("id", studentId).is("deleted_at", null);
    if (updateErr) throw fromDatabaseError(updateErr);
  }

  const { data: fullStudent, error: fetchErr } = await req.auth!.client.from("students")
    .select(selection).eq("school_id", schoolId).eq("id", studentId).is("deleted_at", null).maybeSingle();

  if (fetchErr) throw fromDatabaseError(fetchErr);
  if (!fullStudent) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found");

  sendData(res, formatStudentResponse(fullStudent));
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

