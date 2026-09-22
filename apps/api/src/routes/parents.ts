import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission, requireTenant } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { claimParentLinkSchema, createParentTokenSchema } from "../schemas/parent.js";

const router = Router();

router.post("/link", requireAuth, validate({ body: claimParentLinkSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("claim_parent_link", {
    link_token: req.body.token, profile_name: req.body.full_name, profile_phone: req.body.phone ?? null
  });
  if (error?.code === "AP001") throw new ApiError(422, "PARENT_LINK_INVALID", "Link token is invalid or expired");
  if (error) throw fromDatabaseError(error);
  sendData(res, { link_id: data }, 201);
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
