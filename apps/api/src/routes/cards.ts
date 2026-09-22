import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { cardListQuerySchema, createCardSchema, updateCardSchema } from "../schemas/card.js";
import { idParamsSchema } from "../schemas/common.js";

const router = Router();
const selection = "id, school_id, student_id, card_uid, card_serial, qr_key, status, issued_at, revoked_at, expires_at, created_at, updated_at";

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

router.get("/:id", requirePermission("card.read"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("student_cards").select(selection)
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CARD_NOT_FOUND", "Card was not found");
  sendData(res, data);
}));

router.post("/", requirePermission("card.manage"), validate({ body: createCardSchema }), asyncHandler(async (req, res) => {
  const status = req.body.status ?? "ACTIVE";
  const { data, error } = await req.auth!.client.from("student_cards").insert({
    ...req.body,
    school_id: req.tenant!.schoolId,
    status,
    issued_at: req.body.issued_at ?? new Date().toISOString(),
    revoked_at: status === "ACTIVE" ? null : new Date().toISOString()
  }).select(selection).single();
  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.patch("/:id", requirePermission("card.manage"), validate({ params: idParamsSchema, body: updateCardSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("student_cards").update({
    ...req.body,
    revoked_at: req.body.status === "ACTIVE" ? null : new Date().toISOString()
  }).eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).select(selection).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CARD_NOT_FOUND", "Card was not found");
  sendData(res, data);
}));

router.delete("/:id", requirePermission("card.manage"), validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("student_cards")
    .update({ status: "BLOCKED", revoked_at: new Date().toISOString() })
    .eq("school_id", req.tenant!.schoolId).eq("id", req.params.id).select("id").maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(404, "CARD_NOT_FOUND", "Card was not found");
  res.status(204).send();
}));

export { router as cardsRouter };
