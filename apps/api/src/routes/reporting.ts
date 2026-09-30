import{Router}from"express";import{z}from"zod";import{fromDatabaseError}from"../lib/errors.js";import{sendData}from"../lib/responses.js";import{asyncHandler}from"../middleware/async-handler.js";import{requirePermission}from"../middleware/tenant.js";import{validate}from"../middleware/validate.js";import{paginationSchema}from"../schemas/common.js";import{reportParamsSchema,reportQuerySchema}from"../schemas/report.js";
const router=Router(),definitions={attendance:{table:"attendance_logs",time:"occurred_at_local",fields:"id,student_id,class_id,direction,is_late,occurred_at_local"},waste:{table:"waste_transactions",time:"created_at",fields:"id,student_id,class_id,organic_kg,inorganic_kg,total_kg,source,created_at"},library:{table:"library_visits",time:"occurred_at",fields:"id,student_id,class_id,device_id,source,occurred_at"},extracurricular:{table:"extracurricular_attendance",time:"recorded_at",fields:"id,student_id,extracurricular_id,session_id,status,recorded_at"}}as const;
const csv=(rows:Record<string,unknown>[])=>{if(!rows.length)return"";const keys=Object.keys(rows[0]!);const quote=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`;return[keys.join(","),...rows.map(r=>keys.map(k=>quote(r[k])).join(","))].join("\n")};

router.get("/audit/logs",requirePermission("audit.read"),validate({query:paginationSchema}),asyncHandler(async(req,res)=>{const page=req.query.page as unknown as number,size=req.query.page_size as unknown as number,{data,error,count}=await req.auth!.client.from("audit_logs").select("id,actor_user_id,action,resource_type,resource_id,request_id,route,http_status,metadata,occurred_at",{count:"exact"}).eq("school_id",req.tenant!.schoolId).order("occurred_at",{ascending:false}).range((page-1)*size,page*size-1);if(error)throw fromDatabaseError(error);sendData(res,data??[],200,{page,page_size:size,total:count??0})}));
router.get("/classes-summary", requirePermission("report.read"), asyncHandler(async (req, res) => {
  const schoolId = req.tenant!.schoolId;
  
  const { data: classes, error: cErr } = await req.auth!.client.from("classes")
    .select("id, name, grade_level").eq("school_id", schoolId).is("deleted_at", null).order("name");
  if (cErr) throw fromDatabaseError(cErr);
  
  const { data: counts } = await req.auth!.client.from("student_class_history")
    .select("class_id").eq("school_id", schoolId).eq("is_current", true);
  
  const { data: waste } = await req.auth!.client.from("waste_transactions")
    .select("class_id, total_kg").eq("school_id", schoolId);
    
  const { data: library } = await req.auth!.client.from("library_visits")
    .select("class_id").eq("school_id", schoolId);
    
  const { data: attendance } = await req.auth!.client.from("attendance_logs")
    .select("class_id").eq("school_id", schoolId).eq("direction", "CHECK_IN");
    
  // Aggregate extracurricular memberships per class
  const { data: ekskulMembers } = await req.auth!.client.from("extracurricular_members")
    .select("student_id").eq("school_id", schoolId);
  const studentIdsInEkskul = (ekskulMembers ?? []).map(m => m.student_id);
  const ekskulMap = new Map<string, number>();

  if (studentIdsInEkskul.length > 0) {
    const { data: studentClassRows } = await req.auth!.client.from("student_class_history")
      .select("student_id, class_id").eq("school_id", schoolId).eq("is_current", true).in("student_id", studentIdsInEkskul);
    
    const studentToClassMap = new Map<string, string>();
    for (const sc of studentClassRows ?? []) {
      studentToClassMap.set(sc.student_id, sc.class_id);
    }
    
    for (const m of ekskulMembers ?? []) {
      const cId = studentToClassMap.get(m.student_id);
      if (cId) {
        ekskulMap.set(cId, (ekskulMap.get(cId) ?? 0) + 1);
      }
    }
  }

  const studentMap = new Map<string, number>();
  for (const r of counts ?? []) studentMap.set(r.class_id, (studentMap.get(r.class_id) ?? 0) + 1);
  
  const wasteMap = new Map<string, number>();
  for (const r of waste ?? []) wasteMap.set(r.class_id, (wasteMap.get(r.class_id) ?? 0) + Number(r.total_kg));
  
  const libMap = new Map<string, number>();
  for (const r of library ?? []) libMap.set(r.class_id, (libMap.get(r.class_id) ?? 0) + 1);
  
  const attMap = new Map<string, number>();
  for (const r of attendance ?? []) attMap.set(r.class_id, (attMap.get(r.class_id) ?? 0) + 1);

  const result = (classes ?? []).map(c => ({
    id: c.id,
    name: c.name,
    student_count: studentMap.get(c.id) ?? 0,
    attendance_count: attMap.get(c.id) ?? 0,
    waste_kg: wasteMap.get(c.id) ?? 0,
    library_visits: libMap.get(c.id) ?? 0,
    extracurricular_members: ekskulMap.get(c.id) ?? 0
  }));
  
  sendData(res, result);
}));

router.get("/class-report/:classId", requirePermission("report.read"), validate({ params: z.object({ classId: z.string().uuid() }) }), asyncHandler(async (req, res) => {
  const classId = req.params.classId;
  const schoolId = req.tenant!.schoolId;

  // Get students in this class (via student_class_history)
  const { data: historyRows, error: hErr } = await req.auth!.client.from("student_class_history")
    .select("student_id, students(id, full_name, student_number, nisn)")
    .eq("school_id", schoolId).eq("class_id", classId).eq("is_current", true);
  if (hErr) throw fromDatabaseError(hErr);

  const students = (historyRows ?? []).map(h => {
    const s = Array.isArray(h.students) ? h.students[0] : h.students;
    return { id: h.student_id, full_name: s?.full_name ?? "—", student_number: s?.student_number ?? "—", nisn: s?.nisn ?? "—" };
  });
  const studentIds = students.map(s => s.id);

  // Attendance count per student
  const { data: attData } = await req.auth!.client.from("attendance_logs")
    .select("student_id").eq("school_id", schoolId).eq("class_id", classId).eq("direction", "CHECK_IN").in("student_id", studentIds);
  const attMap = new Map<string, number>();
  for (const r of attData ?? []) attMap.set(r.student_id, (attMap.get(r.student_id) ?? 0) + 1);

  // Waste per student
  const { data: wasteData } = await req.auth!.client.from("waste_transactions")
    .select("student_id, total_kg").eq("school_id", schoolId).in("student_id", studentIds);
  const wasteMap = new Map<string, number>();
  for (const r of wasteData ?? []) wasteMap.set(r.student_id, (wasteMap.get(r.student_id) ?? 0) + Number(r.total_kg));

  // Library visits per student
  const { data: libData } = await req.auth!.client.from("library_visits")
    .select("student_id").eq("school_id", schoolId).in("student_id", studentIds);
  const libMap = new Map<string, number>();
  for (const r of libData ?? []) libMap.set(r.student_id, (libMap.get(r.student_id) ?? 0) + 1);

  // Extracurricular memberships per student
  const { data: ekskulMembersData } = await req.auth!.client.from("extracurricular_members")
    .select("student_id, extracurricular_id, extracurriculars(id, name)").eq("school_id", schoolId).in("student_id", studentIds).eq("status", "ACTIVE");

  // Total sessions held per extracurricular
  const { data: sessionsData } = await req.auth!.client.from("extracurricular_sessions")
    .select("extracurricular_id").eq("school_id", schoolId).neq("status", "CANCELLED");
  const totalSessionsMap = new Map<string, number>();
  for (const sess of sessionsData ?? []) {
    totalSessionsMap.set(sess.extracurricular_id, (totalSessionsMap.get(sess.extracurricular_id) ?? 0) + 1);
  }

  // Student attendance count (PRESENT) per extracurricular
  const { data: ekskulAttData } = await req.auth!.client.from("extracurricular_attendance")
    .select("student_id, extracurricular_id").eq("school_id", schoolId).eq("status", "PRESENT").in("student_id", studentIds);
  const studentAttMap = new Map<string, number>();
  for (const att of ekskulAttData ?? []) {
    const key = `${att.student_id}_${att.extracurricular_id}`;
    studentAttMap.set(key, (studentAttMap.get(key) ?? 0) + 1);
  }

  const ekskulDetailsMap = new Map<string, { id: string, name: string, attended: number, total: number, percentage: number, predicate: string }[]>();
  const ekskulStringMap = new Map<string, string[]>();

  for (const r of ekskulMembersData ?? []) {
    const exObj = Array.isArray(r.extracurriculars) ? (r.extracurriculars as any[])[0] : r.extracurriculars;
    const exId = r.extracurricular_id;
    const name = (exObj?.name ?? "—") as string;
    const totalSess = totalSessionsMap.get(exId) ?? 0;
    const key = `${r.student_id}_${exId}`;
    const attendedSess = studentAttMap.get(key) ?? 0;
    
    let pct = 100;
    let predicate = "Sangat Baik";
    if (totalSess > 0) {
      pct = Math.min(100, Math.round((attendedSess / totalSess) * 100));
      if (pct >= 90) predicate = "Sangat Baik";
      else if (pct >= 75) predicate = "Baik";
      else if (pct >= 60) predicate = "Cukup";
      else predicate = "Kurang";
    } else {
      predicate = "Aktif";
    }

    const detailObj = { id: exId, name, attended: attendedSess, total: totalSess, percentage: pct, predicate };
    const detailsArr = ekskulDetailsMap.get(r.student_id) ?? [];
    detailsArr.push(detailObj);
    ekskulDetailsMap.set(r.student_id, detailsArr);

    const formattedStr = totalSess > 0 ? `${name} ${pct}% (${attendedSess}/${totalSess})` : `${name} (Aktif)`;
    const strArr = ekskulStringMap.get(r.student_id) ?? [];
    strArr.push(formattedStr);
    ekskulStringMap.set(r.student_id, strArr);
  }

  const result = students.map(s => ({
    ...s,
    attendance_count: attMap.get(s.id) ?? 0,
    waste_kg: wasteMap.get(s.id) ?? 0,
    library_visits: libMap.get(s.id) ?? 0,
    extracurriculars: ekskulStringMap.get(s.id) ?? [],
    extracurricular_details: ekskulDetailsMap.get(s.id) ?? []
  }));

  sendData(res, result);
}));

router.get("/:domain",validate({params:reportParamsSchema,query:reportQuerySchema}),asyncHandler(async(req,res)=>{const domain=req.params.domain as keyof typeof definitions,def=definitions[domain],permission=domain==="extracurricular"?"extracurricular.read":`${domain}.read`;await new Promise<void>((resolve,reject)=>requirePermission(permission)(req,res,e=>e?reject(e):resolve()));let query=req.auth!.client.from(def.table).select(def.fields).eq("school_id",req.tenant!.schoolId).order(def.time,{ascending:false}).limit(10000);if(req.query.from)query=query.gte(def.time,String(req.query.from));if(req.query.to)query=query.lte(def.time,String(req.query.to));const{data,error}=await query;if(error)throw fromDatabaseError(error);if(req.query.format==="csv"){res.type("text/csv").setHeader("content-disposition",`attachment; filename=${domain}.csv`);return res.send(csv((data??[])as unknown as Record<string,unknown>[]))}sendData(res,data??[])}));

export{router as reportingRouter};
