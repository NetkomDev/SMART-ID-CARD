import { isIP } from "node:net";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Router, RequestHandler } from "express";
import type { Session } from "@supabase/supabase-js";
import { config } from "../config.js";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { createPublicClient, createServiceClient } from "../lib/supabase.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { validate } from "../middleware/validate.js";
import { parentEnrollmentSchema, parentRecoverySchema } from "../schemas/parent-onboarding.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const invalid = () => new ApiError(422, "PARENT_LINK_INVALID", "QR atau data anak tidak sesuai. Periksa kembali atau hubungi admin sekolah.");
const throttle: RequestHandler = asyncHandler(async (req, _res, next) => {
  // Durable across serverless instances. Never store NISN, DOB, WA or raw QR in rate keys.
  // Vercel overwrites this edge header; outside Vercel rely on Express's trusted proxy configuration.
  const forwarded = process.env.VERCEL === "1" ? req.header("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  const address = forwarded && isIP(forwarded) ? forwarded : req.ip;
  const key = createHmac("sha256", config.SUPABASE_SERVICE_ROLE_KEY).update(`parent-onboard:${address}`).digest("hex");
  const { data, error } = await createServiceClient().rpc("increment_api_rate", { p_key: key, p_window_ms: 900_000 });
  if (error || !data) throw new ApiError(503, "SERVER_UNAVAILABLE", "Pendaftaran belum tersedia. Hubungi admin sekolah.");
  if (Number(data.total_hits) > 10) throw new ApiError(429, "RATE_LIMITED", "Terlalu banyak percobaan. Coba kembali dalam 15 menit.");
  next();
});
async function sessionFor(userId: string): Promise<Session> {
  const admin = createServiceClient();
  const { data: account, error } = await admin.auth.admin.getUserById(userId);
  if (error || !account.user?.app_metadata?.parent_passwordless || !account.user.email) throw invalid();
  // Internal Auth address is never requested from the guardian or exposed to the browser.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: account.user.email });
  if (linkError || !link.properties?.hashed_token) throw new ApiError(503, "SERVER_UNAVAILABLE", "Sesi belum dapat dibuat. Minta QR pribadi kepada admin.");
  const { data, error: loginError } = await createPublicClient().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (loginError || !data.session) throw new ApiError(503, "SERVER_UNAVAILABLE", "Sesi belum dapat dibuat. Minta QR pribadi kepada admin.");
  return data.session;
}
export function mountParentOnboarding(router: Router, establish: (res: import("express").Response, session: Session) => string) {
  router.post("/enroll", validate({ body: parentEnrollmentSchema }), throttle, asyncHandler(async (req, res) => {
    const { token, nisn, date_of_birth, full_name, phone } = req.body;
    const admin = createServiceClient();
    const { data: q, error: qError } = await admin.from("qr_access_tokens").select("school_id,expires_at,revoked_at,role_code").eq("token_hash", hash(token)).maybeSingle();
    if (qError) throw fromDatabaseError(qError);
    if (!q || q.role_code !== "PARENT" || q.revoked_at || (q.expires_at && Date.parse(q.expires_at) <= Date.now())) throw invalid();
    const { data: child, error: childError } = await admin.from("students").select("id").eq("school_id", q.school_id).eq("nisn", nisn).eq("date_of_birth", date_of_birth).eq("is_active", true).is("deleted_at", null).maybeSingle();
    if (childError) throw fromDatabaseError(childError);
    if (!child) throw invalid();
    const { data: existing, error: identityError } = await admin.from("parent_portal_identities").select("user_id").eq("school_id", q.school_id).eq("phone", phone).maybeSingle();
    if (identityError) throw fromDatabaseError(identityError);
    if (existing) throw new ApiError(409, "PARENT_ACCOUNT_EXISTS", "Nomor WA sudah terdaftar di sekolah ini. Minta QR pribadi kepada admin untuk masuk kembali atau menautkan anak tambahan.");
    const { data: account, error: accountError } = await admin.auth.admin.createUser({
      email: `guardian_${randomBytes(24).toString("hex")}@aksis.local`, password: randomBytes(48).toString("base64url"), email_confirm: true,
      app_metadata: { parent_passwordless: true }, user_metadata: { full_name }
    });
    if (accountError || !account.user) throw new ApiError(503, "SERVER_UNAVAILABLE", "Akun wali belum dapat dibuat.");
    const { error: enrollError } = await admin.rpc("enroll_parent_portal", { p_token_hash: hash(token), p_user_id: account.user.id, p_nisn: nisn, p_dob: date_of_birth, p_name: full_name, p_phone: phone });
    if (enrollError) {
      await admin.auth.admin.deleteUser(account.user.id);
      if (enrollError.code === "23505") throw new ApiError(409, "PARENT_ACCOUNT_EXISTS", "Nomor WA sudah terdaftar. Minta QR pribadi kepada admin sekolah.");
      throw invalid();
    }
    const csrf = establish(res, await sessionFor(account.user.id));
    sendData(res, { csrf }, 201);
  }));
  router.post("/recover-qr", validate({ body: parentRecoverySchema }), throttle, asyncHandler(async (req, res) => {
    const { data: userId, error } = await createServiceClient().rpc("consume_parent_recovery", { p_hash: hash(req.body.token) });
    if (error) throw fromDatabaseError(error);
    if (!userId) throw new ApiError(401, "PORTAL_ACCESS_INVALID", "QR pribadi tidak valid, sudah digunakan, atau kedaluwarsa. Minta QR baru kepada admin.");
    const csrf = establish(res, await sessionFor(userId));
    sendData(res, { csrf });
  }));
}
