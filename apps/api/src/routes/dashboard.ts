import{Router}from"express";import{fromDatabaseError}from"../lib/errors.js";import{sendData}from"../lib/responses.js";import{asyncHandler}from"../middleware/async-handler.js";import{requirePermission}from"../middleware/tenant.js";
import { competitionRankings, type RankingEvent } from "../lib/dashboard-rankings.js";
import { dashboardSupportRouter } from "./dashboard-support.js";
const router=Router();
router.use(dashboardSupportRouter);
router.get("/rankings", requirePermission("dashboard.read"), requirePermission("attendance.read"), requirePermission("waste.read"), requirePermission("library.read"), asyncHandler(async (req, res) => {
  const client = req.auth!.client, schoolId = req.tenant!.schoolId;
  const now = new Date();
  const from = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const definitions = [
    { table: "attendance_logs", time: "occurred_at_local", fields: "id,student_id,class_id,occurred_at_local,students(full_name),classes(name)" },
    { table: "waste_transactions", time: "created_at", fields: "id,class_id,total_kg,created_at,classes(name)" },
    { table: "library_visits", time: "occurred_at", fields: "id,class_id,occurred_at,classes(name)" }
  ];
  const [schoolRes, ...results] = await Promise.all([
    client.from("schools").select("timezone").eq("id", schoolId).single(),
    ...definitions.map(async def => {
      const rows: RankingEvent[] = [];
      let offset = 0;
      while (true) {
        let query = client.from(def.table).select(def.fields, { count: "exact" }).eq("school_id", schoolId).gte(def.time, from).lte(def.time, now.toISOString()).order("id").range(offset, offset + 499);
        if (def.table === "attendance_logs") query = query.eq("direction", "CHECK_IN");
        const { data, error, count } = await query;
        if (error) throw fromDatabaseError(error);
        type Relation = { name?: string; full_name?: string };
        type Row = { id: string; student_id?: string; class_id: string | null; total_kg?: number; occurred_at_local?: string; occurred_at?: string; created_at?: string; students?: Relation | Relation[]; classes?: Relation | Relation[] };
        const page = (data ?? []) as unknown as Row[];
        const first = (value: Relation | Relation[] | undefined) => Array.isArray(value) ? value[0] : value;
        for (const row of page) rows.push({ id: row.id, student_id: row.student_id, class_id: row.class_id, at: (row.occurred_at_local ?? row.created_at ?? row.occurred_at)!, value: row.total_kg, name: first(row.students)?.full_name, class_name: first(row.classes)?.name });
        offset += page.length;
        if (!page.length || offset >= (count ?? offset)) break;
      }
      return rows;
    })
  ]);
  if (schoolRes.error) throw fromDatabaseError(schoolRes.error);
  res.setHeader("cache-control", "private, no-store");
  sendData(res, { school_id: schoolId, ...competitionRankings({ attendance: results[0]!, waste: results[1]!, library: results[2]! }, schoolRes.data.timezone, now) });
}));
router.get("/today",requirePermission("dashboard.read"),asyncHandler(async(req,res)=>{const{data,error}=await req.auth!.client.rpc("get_dashboard_today",{target_school_id:req.tenant!.schoolId});if(error)throw fromDatabaseError(error);res.setHeader("cache-control","private, no-store");sendData(res,data)}));
export{router as dashboardRouter};
