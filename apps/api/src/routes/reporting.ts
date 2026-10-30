import { Router } from "express";
import { z } from "zod";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { paginationSchema } from "../schemas/common.js";
import { reportParamsSchema, reportQuerySchema } from "../schemas/report.js";
import { csv } from "../lib/report-csv.js";
const router = Router();
const period = (req: import("express").Request) => ({ p_school: req.tenant!.schoolId, p_from: req.query.from ?? null, p_to: req.query.to ?? null });
router.get("/audit/logs", requirePermission("audit.read"), validate({ query: paginationSchema }), asyncHandler(async (req, res) => {
  const page = Number(req.query.page), size = Number(req.query.page_size);
  const { data, error, count } = await req.auth!.client.from("audit_logs").select("id,actor_user_id,action,resource_type,resource_id,request_id,route,http_status,metadata,occurred_at", { count: "exact" }).eq("school_id", req.tenant!.schoolId).order("occurred_at", { ascending: false }).range((page - 1) * size, page * size - 1);
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? [], 200, { page, page_size: size, total: count ?? 0 });
}));
router.get("/classes-summary", requirePermission("report.read"), validate({ query: reportQuerySchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("report_classes", period(req));
  if (error) throw fromDatabaseError(error);
  const { rows, ...meta } = data;
  res.setHeader("cache-control", "private, no-store"); sendData(res, rows, 200, meta);
}));
router.get("/class-report/:classId", requirePermission("report.read"), validate({ params: z.object({ classId: z.uuid() }), query: reportQuerySchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("report_class_students", { ...period(req), p_class: req.params.classId });
  if (error) throw fromDatabaseError(error);
  const { rows, ...meta } = data;
  for (const row of rows) {
    row.extracurricular_details = row.extracurricular_details.map((d: { attended: number; total: number; name: string }) => {
      const percentage = d.total ? Math.min(100, Math.round(d.attended / d.total * 100)) : null;
      return { ...d, percentage, predicate: percentage === null ? "Belum ada sesi" : percentage >= 90 ? "Sangat Baik" : percentage >= 75 ? "Baik" : percentage >= 60 ? "Cukup" : "Kurang" };
    });
    row.extracurriculars = row.extracurricular_details.map((d: { name: string; attended: number; total: number }) => `${d.name} (${d.attended}/${d.total})`);
  }
  res.setHeader("cache-control", "private, no-store"); sendData(res, rows, 200, meta);
}));
const exportBody = z.object({ domain: z.enum(["attendance", "waste", "library", "extracurricular"]), from: z.iso.datetime({offset:true}).optional(), to: z.iso.datetime({offset:true}).optional() }).strict();
router.post("/exports", requirePermission("report.read"), validate({ body: exportBody }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("create_report_export", { p_school: req.tenant!.schoolId, p_domain: req.body.domain, p_from: req.body.from ?? null, p_to: req.body.to ?? null });
  if (error) throw fromDatabaseError(error);
  res.setHeader("cache-control", "private, no-store"); sendData(res, data, 201);
}));
router.get("/exports/:id", requirePermission("report.read"), validate({ params: z.object({id:z.uuid()}), query: z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(500) }).strict() }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("read_report_export", { p_id: req.params.id, p_offset: req.query.offset, p_limit: req.query.limit });
  if (error) throw fromDatabaseError(error);
  res.setHeader("cache-control", "private, no-store"); sendData(res, data);
}));
// Compatibility endpoint: explicit bounded response; use paged exports for larger datasets.
router.get("/:domain", requirePermission("report.read"), validate({ params: reportParamsSchema, query: reportQuerySchema }), asyncHandler(async (req, res) => {
  const { data: snapshot, error } = await req.auth!.client.rpc("create_report_export", { ...period(req), p_domain: req.params.domain });
  if (error) throw fromDatabaseError(error);
  if (snapshot.row_count > 5000) throw new ApiError(422, "VALIDATION_ERROR", "Gunakan ekspor bertahap /reports/exports untuk lebih dari 5.000 baris.");
  const rows: Record<string, unknown>[] = [];
  while (rows.length < snapshot.row_count) {
    const { data: page, error: pageError } = await req.auth!.client.rpc("read_report_export", { p_id: snapshot.id, p_offset: rows.length, p_limit: 500 });
    if (pageError) throw fromDatabaseError(pageError);
    if (!page.rows.length) throw new ApiError(503, "SERVER_UNAVAILABLE", "Ekspor tidak lengkap.");
    rows.push(...page.rows);
  }
  res.setHeader("cache-control", "private, no-store");
  if (req.query.format === "csv") { res.type("text/csv"); res.setHeader("content-disposition", `attachment; filename=${req.params.domain}.csv`); res.send(csv(rows)); }
  else sendData(res, rows, 200, snapshot);
}));
export { router as reportingRouter };
