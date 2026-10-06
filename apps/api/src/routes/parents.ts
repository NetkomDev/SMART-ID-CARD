import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, requireTenant } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { claimParentLinkSchema, claimParentPermitSchema, createParentTokenSchema } from "../schemas/parent.js";
import { processStudentPhotoWorker } from "../services/photo-processor.js";

const router = Router();

router.post("/permits", requireAuth, validate({ body: claimParentPermitSchema }), asyncHandler(async (req, res) => {
  const { student_id, permit_date, reason, notes, attachment_url } = req.body as {
    student_id: string;
    permit_date: string;
    reason: string;
    notes?: string;
    attachment_url?: string;
  };

  const { data, error } = await req.auth!.client.rpc("submit_student_absence_permit", {
    p_student_id: student_id,
    p_permit_date: permit_date,
    p_reason: reason,
    p_notes: notes ?? "",
    p_attachment_url: attachment_url ?? null
  });

  if (error) throw fromDatabaseError(error);
  sendData(res, data, 201);
}));

router.post("/link", requireAuth, validate({ body: claimParentLinkSchema }), asyncHandler(async (req, res) => {
  let { nisn, dob, full_name } = req.body as { nisn: string; dob: string; full_name?: string };
  
  let formattedDob = dob.trim();
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(formattedDob)) {
    const [d, m, y] = formattedDob.split(/[\/-]/);
    formattedDob = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  const { data, error } = await req.auth!.client.rpc("link_student_to_parent_portal", {
    p_nisn: nisn.trim(),
    p_dob: formattedDob,
    p_parent_name: (full_name ?? "").trim()
  });

  if (error) throw fromDatabaseError(error);
  sendData(res, { link_id: data?.student_id || data?.id }, 201);
}));

router.get("/profile", requireAuth, asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client
    .from("parent_profiles")
    .select("full_name")
    .eq("user_id", req.auth!.user.id)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? { full_name: null });
}));

router.get("/children", requireAuth, asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("get_parent_children");
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));

router.get("/children/:id/today", requireAuth, validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("get_parent_child_today", { target_student_id: req.params.id });
  if (error?.code === "AP002") throw new ApiError(404, "CHILD_NOT_LINKED", "Child relationship was not found");
  if (error) throw fromDatabaseError(error);
  sendData(res, data);
}));

router.post("/children/:id/photo", requireAuth, validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { photo_url } = req.body as { photo_url: string };
  if (!photo_url || typeof photo_url !== "string" || !photo_url.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Photo data is required");
  }

  // Worker pipeline server-side: Photoroom (bg + relighting) / Clipdrop + sharp / foto asli
  const processed = await processStudentPhotoWorker(photo_url.trim());

  const { data, error } = await req.auth!.client.rpc("update_student_photo_by_parent", {
    p_student_id: req.params.id,
    p_photo_data: processed.dataUrl
  });
  if (error) throw fromDatabaseError(error);
  sendData(res, { result: data, photo_provider: processed.provider }, 200);
}));

router.post("/link-tokens", requireAuth, requireTenant, requirePermission("parent.manage"),
  validate({ body: createParentTokenSchema }), asyncHandler(async (req, res) => {
    const token = randomBytes(32).toString("base64url");
    const { data, error } = await req.auth!.client.from("parent_link_tokens").insert({
      school_id: req.tenant!.schoolId,
      student_id: req.body.student_id,
      relationship: req.body.relationship,
      token_hash: createHash("sha256").update(token).digest("hex"),
      expires_at: new Date(Date.now() + req.body.expires_in_hours * 3_600_000).toISOString(),
      created_by: req.auth!.user.id
    }).select("id, expires_at").single();
    if (error) throw fromDatabaseError(error);
    sendData(res, { ...data, token }, 201);
  }));

export { router as parentsRouter };
