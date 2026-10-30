import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response, type RequestHandler } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { createPublicClient, createUserClient } from "../lib/supabase.js";
import { sendData } from "../lib/responses.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const COOKIE = "aksis_parent_v2";
type Saved = { access_token: string; refresh_token: string; csrf: string };
function key() {
  const secret = config.SESSION_COOKIE_KEY || config.SUPABASE_SERVICE_ROLE_KEY;
  if (secret.length < 32) throw new ApiError(503, "SERVER_UNAVAILABLE", "Konfigurasi sesi belum tersedia.");
  return createHash("sha256").update(`aksis-parent-cookie-v2:${secret}`).digest();
}
export function sealSession(value: Saved): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function readParentSession(req: Request): Saved | null {
  const cookie = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie) return null;
  try {
    const input = Buffer.from(cookie, "base64url"), decipher = createDecipheriv("aes-256-gcm", key(), input.subarray(0, 12));
    decipher.setAuthTag(input.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]).toString());
    return typeof value.access_token === "string" && typeof value.refresh_token === "string" && typeof value.csrf === "string" ? value : null;
  } catch { return null; }
}
function save(res: Response, value: Saved) {
  res.cookie(COOKIE, sealSession(value), { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "strict", path: "/api/v1/parent", maxAge: 7 * 86400_000 });
  res.setHeader("cache-control", "no-store");
}
function clear(res: Response) { res.clearCookie(COOKIE, { path: "/api/v1/parent", httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "strict" }); }
const checkOrigin: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.header("origin");
  const allowed = new Set([new URL(config.PUBLIC_APP_URL).origin, ...config.corsOrigins]);
  if (!origin || !allowed.has(origin)) return next(new ApiError(403, "FORBIDDEN", "Asal permintaan tidak diizinkan."));
  next();
};
const checkCsrf: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const saved = readParentSession(req);
  if (!saved || req.header("x-csrf-token") !== saved.csrf) return next(new ApiError(403, "FORBIDDEN", "Sesi formulir tidak valid. Muat ulang halaman."));
  next();
};
/** Bearer API clients still use JWT/RLS. Browser cookies additionally require Origin and CSRF. */
export const parentCookieAuth: RequestHandler = (req, res, next) => {
  res.setHeader("cache-control", "private, no-store");
  if (req.header("authorization")) return next();
  const saved = readParentSession(req);
  if (!saved) return next(new ApiError(401, "AUTH_REQUIRED", "Masuk dengan akun orang tua."));
  checkOrigin(req, res, err => {
    if (err) return next(err);
    checkCsrf(req, res, csrfError => {
      if (csrfError) return next(csrfError);
      req.headers.authorization = `Bearer ${saved.access_token}`;
      next();
    });
  });
};
const individual: RequestHandler = asyncHandler(async (req, _res, next) => {
  const user = req.auth!.user;
  if (!user.email_confirmed_at || user.app_metadata?.portal_access) throw new ApiError(403, "FORBIDDEN", "Gunakan akun individual dengan email terverifikasi.");
  const { error } = await req.auth!.client.rpc("ensure_parent_profile", { p_name: user.user_metadata?.full_name || user.email!.split("@")[0] });
  if (error) throw fromDatabaseError(error);
  next();
});
const credentials = z.object({ email: z.email(), password: z.string().min(8).max(128) }).strict();
export const parentSessionRouter = Router();
parentSessionRouter.use(checkOrigin);
parentSessionRouter.post("/login", validate({ body: credentials }), asyncHandler(async (req, res) => {
  const { data, error } = await createPublicClient().auth.signInWithPassword(req.body);
  if (error || !data.session || !data.user.email_confirmed_at || data.user.app_metadata?.portal_access) throw new ApiError(401, "INVALID_CREDENTIALS", "Email/password tidak sesuai atau email belum diverifikasi.");
  const client = createUserClient(data.session.access_token);
  const { error: profileError } = await client.rpc("ensure_parent_profile", { p_name: data.user.user_metadata?.full_name || req.body.email.split("@")[0] });
  if (profileError) throw fromDatabaseError(profileError);
  const csrf = randomBytes(24).toString("base64url");
  save(res, { access_token: data.session.access_token, refresh_token: data.session.refresh_token, csrf });
  sendData(res, { csrf });
}));
parentSessionRouter.post("/register", validate({ body: credentials.extend({ full_name: z.string().trim().min(1).max(200) }) }), asyncHandler(async (req, res) => {
  const { email, password, full_name } = req.body;
  const { error } = await createPublicClient().auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: new URL("/parent/", config.PUBLIC_APP_URL).href } });
  if (error) throw new ApiError(422, "VALIDATION_ERROR", "Pendaftaran belum dapat diproses. Coba kembali atau hubungi sekolah.");
  sendData(res, { message: "Periksa email untuk verifikasi, lalu masuk." }, 202);
}));
parentSessionRouter.post("/forgot", validate({ body: z.object({ email: z.email() }).strict() }), asyncHandler(async (req, res) => {
  await createPublicClient().auth.resetPasswordForEmail(req.body.email, { redirectTo: new URL("/parent/", config.PUBLIC_APP_URL).href });
  sendData(res, { message: "Jika akun tersedia, petunjuk pemulihan dikirim melalui email." }, 202);
}));
parentSessionRouter.post("/restore", validate({ body: z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) }).strict() }), asyncHandler(async (req, res) => {
  const client = createPublicClient();
  const { data, error } = await client.auth.setSession(req.body);
  if (error || !data.session || !data.user?.email_confirmed_at || data.user.app_metadata?.portal_access) throw new ApiError(401, "AUTH_INVALID", "Tautan sesi tidak valid.");
  const csrf = randomBytes(24).toString("base64url");
  save(res, { access_token: data.session.access_token, refresh_token: data.session.refresh_token, csrf });
  sendData(res, { csrf });
}));
parentSessionRouter.post("/refresh", checkCsrf, asyncHandler(async (req, res) => {
  const saved = readParentSession(req)!;
  const { data, error } = await createPublicClient().auth.refreshSession({ refresh_token: saved.refresh_token });
  if (error || !data.session || data.user?.app_metadata?.portal_access) { clear(res); throw new ApiError(401, "AUTH_INVALID", "Sesi berakhir. Masuk kembali."); }
  save(res, { access_token: data.session.access_token, refresh_token: data.session.refresh_token, csrf: saved.csrf });
  sendData(res, { csrf: saved.csrf });
}));
parentSessionRouter.get("/csrf", (req, res) => {
  const saved = readParentSession(req);
  res.setHeader("cache-control", "no-store");
  if (!saved) throw new ApiError(401, "AUTH_REQUIRED", "Masuk dengan akun orang tua.");
  sendData(res, { csrf: saved.csrf });
});
parentSessionRouter.use(parentCookieAuth, requireAuth, individual);
parentSessionRouter.get("/context", (req, res) => {
  const saved = readParentSession(req);
  res.setHeader("cache-control", "no-store");
  sendData(res, { id: req.auth!.user.id, user_id: req.auth!.user.id, role_code: "PARENT", school_id: "", school_name: "Sekolah anak terhubung", metadata: {}, csrf: saved?.csrf });
});
parentSessionRouter.post("/password", validate({ body: z.object({ password: z.string().min(12).max(128) }).strict() }), asyncHandler(async (req, res) => {
  const client = createPublicClient(), saved = readParentSession(req);
  if (!saved) throw new ApiError(401,"AUTH_REQUIRED","Sesi browser diperlukan.");
  const { error: sessionError } = await client.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
  if (sessionError) throw new ApiError(401, "AUTH_INVALID", "Sesi berakhir.");
  const { error } = await client.auth.updateUser({ password: req.body.password });
  if (error) throw new ApiError(422, "VALIDATION_ERROR", "Password belum dapat diubah.");
  await client.auth.signOut({ scope: "global" }); clear(res); res.status(204).send();
}));
parentSessionRouter.post("/logout", asyncHandler(async (req, res) => {
  const saved = readParentSession(req);
  if (!saved) throw new ApiError(401,"AUTH_REQUIRED","Sesi browser diperlukan.");
  clear(res);
  const { error: revokeError } = await req.auth!.client.rpc("revoke_current_parent_session");
  if (revokeError) throw fromDatabaseError(revokeError);
  const client = createPublicClient();
  await client.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token });
  const { error } = await client.auth.signOut({ scope: "local" });
  clear(res);
  if (error) throw new ApiError(503, "SERVER_UNAVAILABLE", "Sesi lokal dibersihkan; pencabutan server belum terkonfirmasi.");
  res.status(204).send();
}));
