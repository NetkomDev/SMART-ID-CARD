import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { createWasteSchema } from "../schemas/waste.js";
import { readWasteDashboard } from "../services/waste-dashboard.js";

const router = Router();

router.post("/transactions", requirePermission("waste.create"), validate({ body: createWasteSchema }), asyncHandler(async (req, res) => {
  // A retry after a lost response must return the original deposit, even after schedule closure.
  const columns = "id,event_id,class_id,student_id,organic_kg,inorganic_kg,total_kg,points_earned,source,created_at";
  const findExisting = () => req.auth!.client.from("waste_transactions").select(columns)
    .eq("school_id", req.tenant!.schoolId).eq("event_id", req.body.event_id).maybeSingle();
  const replyExisting = (row: Record<string, unknown>) => {
    if (["class_id", "student_id", "organic_kg", "inorganic_kg", "source"].some(key => row[key] !== req.body[key])) {
      throw new ApiError(409, "CONFLICT", "Setoran sebelumnya memiliki isi berbeda. Gunakan transaksi baru.");
    }
    sendData(res, row);
  };
  const existing = await findExisting();
  if (existing.error) throw fromDatabaseError(existing.error);
  if (existing.data) { replyExisting(existing.data); return; }

  const { data, error } = await req.auth!.client.from("waste_transactions").insert({
    ...req.body,
    school_id: req.tenant!.schoolId,
    staff_user_id: req.auth!.user.id
  }).select(columns).single();
  
  if (error?.code === "23505") {
    const duplicate = await findExisting();
    if (duplicate.error) throw fromDatabaseError(duplicate.error);
    if (duplicate.data) { replyExisting(duplicate.data); return; }
  }
  if (error?.code === "42501" && error.message.includes("jadwal")) throw new ApiError(403, "FORBIDDEN", error.message);
  if (error?.code === "23514" && error.message.includes("Siswa")) throw new ApiError(422, "VALIDATION_ERROR", error.message);
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.get("/dashboard", requirePermission("waste.read"), asyncHandler(async (req, res) => {
  const period = req.query.period ?? "month";
  if (typeof period !== "string" || !["today", "month", "all"].includes(period)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Periode klasemen tidak valid.");
  }
  const { data, error } = await req.auth!.client.rpc("waste_dashboard", {
    p_school_id: req.tenant!.schoolId, p_period: period
  });
  if (error?.code === "PGRST202") {
    const dashboard = await readWasteDashboard(req.auth!.client, req.auth!.user.id,
      Boolean(req.auth!.user.app_metadata?.portal_access), req.tenant!.schoolId, period as "today" | "month" | "all");
    res.setHeader("Cache-Control", "no-store");
    sendData(res, { ...dashboard, school_id: req.tenant!.schoolId });
    return;
  }
  if (error) throw fromDatabaseError(error);
  res.setHeader("Cache-Control", "no-store");
  sendData(res, { ...data, school_id: req.tenant!.schoolId });
}));

router.get("/ranking", requirePermission("waste.read"), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("waste_transactions")
    .select("class_id,total_kg,classes(name)")
    .eq("school_id", req.tenant!.schoolId);
    
  if (error) throw fromDatabaseError(error);
  
  const totals = new Map<string, { class_id: string; class_name: string; total_kg: number }>();
  for (const row of data ?? []) {
    const c = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    const old = totals.get(row.class_id) ?? { class_id: row.class_id, class_name: c?.name ?? "—", total_kg: 0 };
    old.total_kg += Number(row.total_kg);
    totals.set(row.class_id, old);
  }
  
  sendData(res, [...totals.values()].sort((a, b) => b.total_kg - a.total_kg));
}));

router.get("/summary", requirePermission("waste.read"), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("waste_transactions")
    .select("organic_kg,inorganic_kg,total_kg")
    .eq("school_id", req.tenant!.schoolId);
    
  if (error) throw fromDatabaseError(error);
  
  sendData(res, (data ?? []).reduce((a, r) => ({
    organic_kg: a.organic_kg + Number(r.organic_kg),
    inorganic_kg: a.inorganic_kg + Number(r.inorganic_kg),
    total_kg: a.total_kg + Number(r.total_kg)
  }), { organic_kg: 0, inorganic_kg: 0, total_kg: 0 }));
}));

export { router as wasteRouter };
