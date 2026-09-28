import { z } from "zod";
import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { cardListQuerySchema, createCardSchema, updateCardSchema } from "../schemas/card.js";
import { idParamsSchema } from "../schemas/common.js";

const router = Router();
const selection = "id, school_id, student_id, card_uid, card_serial, qr_key, status, issued_at, revoked_at, expires_at, created_at, updated_at, students(full_name, student_number)";

router.get("/", requirePermission("card.read"), validate({ query: cardListQuerySchema }), asyncHandler(async (req, res) => {
  const { page, page_size: pageSize, student_id: studentId, status } = req.query as unknown as {
    page: number; page_size: number; student_id?: string; status?: string;
  };
  let query = req.auth!.client.from("student_cards").select(selection, { count: "exact" })
    .eq("school_id", req.tenant!.schoolId).range((page - 1) * pageSize, page * pageSize - 1)
    .order("created_at", { ascending: false });
  if (studentId) query = query.eq("student_id", studentId);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? [], 200, { page, page_size: pageSize, total: count ?? 0 });
}));

router.get("/summary", requirePermission("card.read"), asyncHandler(async (req, res) => {
  const { count: activeCount, error: activeError } = await req.auth!.client.from("student_cards")
    .select("id", { count: "exact", head: true })
    .eq("school_id", req.tenant!.schoolId)
    .eq("status", "ACTIVE");
  
  if (activeError) throw fromDatabaseError(activeError);

  const { count: blockedCount, error: blockedError } = await req.auth!.client.from("student_cards")
    .select("id", { count: "exact", head: true })
    .eq("school_id", req.tenant!.schoolId)
    .in("status", ["BLOCKED", "LOST"]);

  if (blockedError) throw fromDatabaseError(blockedError);

  sendData(res, { active: activeCount ?? 0, blocked: blockedCount ?? 0 });
}));

router.post("/resolve", requirePermission("student.read"), validate({ body: z.object({ qr_key: z.string().trim().min(16).max(128) }).strict() }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("resolve_student_card", { p_school: req.tenant!.schoolId, p_qr: req.body.qr_key });
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

router.get("/:id", requirePermission("card.read"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("student_cards").select(selection)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CARD_NOT_FOUND", "Card was not found");
  sendData(res, data);
}));

router.post("/", requirePermission("card.manage"), (_req, _res, next) => next(new ApiError(409, "CONFLICT", "Issue cards through printed production batches")));

router.patch("/:id", requirePermission("card.manage"), validate({ params: idParamsSchema, body: updateCardSchema }), asyncHandler(async (req, res) => {
  const found = await req.auth!.client.from("student_cards").select("id").eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).maybeSingle();
  if (found.error) throw fromDatabaseError(found.error);
  if (!found.data) throw new ApiError(404, "CARD_NOT_FOUND", "Card was not found in this school");
  const { data, error } = await req.auth!.client.rpc("set_card_status", {
    p_card: req.params.id, p_status: req.body.status, p_reason: req.body.reason, p_expires: req.body.expires_at ?? null
  });
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CARD_NOT_FOUND", "Card was not found");
  sendData(res, data);
}));

router.delete("/:id", requirePermission("card.manage"), (_req, _res, next) => next(new ApiError(409, "CONFLICT", "Block the card using PATCH with a reason")));

export { router as cardsRouter };
