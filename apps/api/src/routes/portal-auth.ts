import type { PostgrestError } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { Router } from "express";
import { config } from "../config.js";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { createPublicClient, createServiceClient } from "../lib/supabase.js";
import { sendData } from "../lib/responses.js";
import { logger } from "../lib/logger.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { idParamsSchema } from "../schemas/common.js";
import { qrGenerateSchema, qrLoginSchema } from "../schemas/portal.js";

export const portalAuthRouter = Router();
const databaseError = (error: PostgrestError) => ["PGRST202", "PGRST204", "42P01", "42703"].includes(error.code)
  ? new ApiError(503, "PORTAL_NOT_CONFIGURED", "Pembaruan database portal QR belum diterapkan. Hubungi pengelola sistem.")
  : fromDatabaseError(error);

const service = () => {
  if (!config.SUPABASE_SERVICE_ROLE_KEY) throw new ApiError(503, "PORTAL_NOT_CONFIGURED", "Konfigurasi akses portal pada server belum lengkap.");
  return createServiceClient();
};

portalAuthRouter.post("/generate", requireAuth, validate({ body: qrGenerateSchema }), asyncHandler(async (req, res) => {
  const { school_id, role_code, metadata } = req.body;
  // Authorization happens before creating an Auth user. The RPC repeats it in its transaction.
  const { data: allowed, error: accessError } = await req.auth!.client.rpc("can_manage_portal_access", { target_school_id: school_id });
  if (accessError) throw databaseError(accessError);
  if (!allowed) throw new ApiError(403, "FORBIDDEN", "Hanya admin sekolah aktif yang dapat membuat QR portal.");
  const admin = service();
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const email = `portal_${hash.slice(0, 40)}@aksis.local`;
  const password = createHmac("sha256", config.SUPABASE_SERVICE_ROLE_KEY).update(token).digest("hex");
  const { data: account, error: accountError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { portal_access: true }, user_metadata: { full_name: `Portal ${role_code}` }
  });
  if (accountError || !account.user) throw new ApiError(503, "PORTAL_CREATE_FAILED", "Akun akses portal belum dapat dibuat. Periksa konfigurasi Auth server.");
  const { data, error } = await admin.rpc("provision_portal_access", {
    p_actor_id: req.auth!.user.id, p_school_id: school_id, p_user_id: account.user.id,
    p_token_hash: hash, p_email: email, p_role_code: role_code, p_metadata: metadata
  });
  if (error) {
    const cleanup = await admin.auth.admin.deleteUser(account.user.id);
    if (cleanup.error) logger.error({ userId: account.user.id }, "portal account compensation failed");
    throw databaseError(error);
  }
  sendData(res, { id: data, token, role_code, school_id, metadata }, 201);
}));

portalAuthRouter.post("/login", validate({ body: qrLoginSchema }), asyncHandler(async (req, res) => {
  const admin = service();
  const hash = createHash("sha256").update(req.body.token).digest("hex");
  const { data: entry, error } = await admin.from("qr_access_tokens")
    .select("id,school_id,auth_user_id,shadow_email,role_code,metadata,expires_at,revoked_at")
    .eq("token_hash", hash).maybeSingle();
  if (error) throw databaseError(error);
  if (!entry || entry.role_code !== req.body.role_code || entry.revoked_at ||
    (entry.expires_at && Date.parse(entry.expires_at) <= Date.now())) {
    throw new ApiError(401, "PORTAL_ACCESS_INVALID", "QR tidak sesuai portal, sudah kedaluwarsa, atau telah dinonaktifkan admin.");
  }
  const password = createHmac("sha256", config.SUPABASE_SERVICE_ROLE_KEY).update(req.body.token).digest("hex");
  const client = createPublicClient();
  const { data: login, error: loginError } = await client.auth.signInWithPassword({ email: entry.shadow_email, password });
  if (loginError || !login.session) throw new ApiError(401, "PORTAL_ACCESS_INVALID", "QR tidak dapat digunakan. Minta QR baru kepada admin sekolah.");
  const { data: context, error: contextError } = await client.rpc("get_portal_context");
  if (contextError || !context) throw new ApiError(401, "PORTAL_ACCESS_INVALID", "Akses portal telah dinonaktifkan.");
  await admin.from("qr_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", entry.id);
  sendData(res, { session: login.session, portal: context });
}));

portalAuthRouter.get("/context", requireAuth, asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.rpc("get_portal_context");
  if (error || !data) throw new ApiError(401, "PORTAL_ACCESS_INVALID", "Akses portal telah dinonaktifkan. Hubungi admin sekolah.");
  sendData(res, data);
}));

portalAuthRouter.delete("/:id", requireAuth, validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const { error } = await req.auth!.client.rpc("revoke_portal_access", { p_token_id: req.params.id });
  if (error) throw databaseError(error);
  res.status(204).send();
}));

portalAuthRouter.delete("/:id/hard", requireAuth, validate({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  const admin = service();
  const { data: q, error: qErr } = await req.auth!.client.from("qr_access_tokens").select("auth_user_id, school_id").eq("id", req.params.id).single();
  if (qErr || !q) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Akses portal tidak ditemukan");
  
  const { data: allowed, error: accessError } = await req.auth!.client.rpc("can_manage_portal_access", { target_school_id: q.school_id });
  if (accessError || !allowed) throw new ApiError(403, "FORBIDDEN", "Hanya admin sekolah yang dapat menghapus akses portal.");
  
  const cleanup = await admin.auth.admin.deleteUser(q.auth_user_id);
  if (cleanup.error) throw new ApiError(500, "INTERNAL_ERROR", "Gagal menghapus kredensial login");
  
  res.status(204).send();
}));

portalAuthRouter.get("/", requireAuth, validate({ query: z.object({ school_id: z.uuid() }).strict() }), asyncHandler(async (req, res) => {
  const { data: allowed, error: accessError } = await req.auth!.client.rpc("can_manage_portal_access", { target_school_id: req.query.school_id });
  if (accessError) throw databaseError(accessError);
  if (!allowed) throw new ApiError(403, "FORBIDDEN", "Hanya admin sekolah yang dapat melihat akses portal.");
  const { data, error } = await req.auth!.client.from("qr_access_tokens")
    .select("id,role_code,metadata,created_at,revoked_at,last_used_at")
    .eq("school_id", req.query.school_id).order("created_at", { ascending: false }).limit(200);
  if (error) throw databaseError(error);
  sendData(res, data ?? []);
}));
