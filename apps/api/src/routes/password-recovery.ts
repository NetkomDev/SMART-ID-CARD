import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { createServiceClient, createPublicClient } from "../lib/supabase.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { validate } from "../middleware/validate.js";

/** Mounted after requireAuth + requirePlatform. No bulk password fallback. */
export const passwordRecoveryRouter = Router();
const params = z.object({ id: z.uuid() });
const body = z.object({ operation_id: z.uuid(), reason: z.string().trim().min(3).max(300) }).strict();
passwordRecoveryRouter.get("/recovery-operations", asyncHandler(async (req,res)=>{
  const {data,error}=await req.auth!.client.from("external_operations").select("id,school_id,target_user_id,status,created_at,updated_at").order("created_at",{ascending:false}).limit(100);
  if(error)throw fromDatabaseError(error);sendData(res,data);
}));
passwordRecoveryRouter.get("/schools/:id/recovery-candidates", validate({ params }), asyncHandler(async (req, res) => {
  const { data, error } = await req.auth!.client.from("school_users")
    .select("id,user_id,users(full_name),school_user_roles!inner(roles!inner(code,is_active,deleted_at))")
    .eq("school_id", req.params.id).eq("status", "ACTIVE").is("deleted_at", null)
    .eq("school_user_roles.roles.code", "SCHOOL_ADMIN").eq("school_user_roles.roles.is_active", true).is("school_user_roles.roles.deleted_at", null);
  if (error) throw fromDatabaseError(error);
  sendData(res, data ?? []);
}));
passwordRecoveryRouter.post("/schools/:id/reset-admin-password", (_req, _res, next) => next(new ApiError(422, "VALIDATION_ERROR", "Pilih satu administrator melalui daftar akun untuk pemulihan email.")));
passwordRecoveryRouter.post("/iam/:id/reset-password", validate({ params, body }), asyncHandler(async (req, res) => {
  const { data: member, error } = await req.auth!.client.from("school_users")
    .select("user_id,school_id").eq("id", req.params.id).eq("status", "ACTIVE").is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!member) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Keanggotaan aktif tidak ditemukan.");
  const { data: target, error: targetError } = await createServiceClient().auth.admin.getUserById(member.user_id);
  if (targetError) throw new ApiError(503, "SERVER_UNAVAILABLE", "Identitas target belum dapat diverifikasi.");
  if (!target.user?.email || !target.user.email_confirmed_at || target.user.app_metadata?.portal_access) throw new ApiError(422, "VALIDATION_ERROR", "Akun memerlukan verifikasi alamat email individual sebelum pemulihan.");
  const { data: operation, error: beginError } = await req.auth!.client.rpc("begin_password_recovery", { p_id: req.body.operation_id, p_school: member.school_id, p_user: member.user_id, p_reason: req.body.reason });
  if (beginError) throw fromDatabaseError(beginError);
  if (!operation?.execute) { sendData(res, { operation_id: req.body.operation_id, status: operation?.status, duplicate: true }, 202); return; }
  let status = "UNKNOWN";
  try {
    const { error: recoveryError } = await createPublicClient().auth.resetPasswordForEmail(target.user.email, { redirectTo: new URL("/parent/", config.PUBLIC_APP_URL).href });
    status = recoveryError ? "UNKNOWN" : "SUCCEEDED";
  } catch { status = "UNKNOWN"; }
  const { error: finishError } = await req.auth!.client.rpc("finish_password_recovery", { p_id: req.body.operation_id, p_status: status });
  if (finishError) throw new ApiError(503, "SERVER_UNAVAILABLE", "Hasil pemulihan perlu direkonsiliasi. Jangan ulangi dengan ID operasi baru.");
  sendData(res, { operation_id: req.body.operation_id, status, message: status === "SUCCEEDED" ? "Petunjuk pemulihan dikirim ke email akun terverifikasi." : "Pengiriman belum terkonfirmasi; periksa status operasi." }, 202);
}));
