import { Router } from "express";
import { z } from "zod";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { sendData } from "../lib/responses.js";
import { createPublicClient, createUserClient } from "../lib/supabase.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const loginSchema = z.object({ email: z.email(), password: z.string().min(8).max(128) }).strict();
const refreshSchema = z.object({ refresh_token: z.string().min(1) }).strict();
const logoutSchema = z.object({ refresh_token: z.string().min(1) }).strict();

router.post("/login", validate({ body: loginSchema }), asyncHandler(async (req, res) => {
  const client = createPublicClient();
  const { data, error } = await client.auth.signInWithPassword(req.body);
  if (error || !data.session) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");

  const userClient = createUserClient(data.session.access_token);
  const { data: memberships, error: membershipError } = await userClient
    .from("school_users")
    .select("school_id, schools(id, code, name)")
    .eq("status", "ACTIVE")
    .is("deleted_at", null);
  if (membershipError) throw fromDatabaseError(membershipError);

  sendData(res, {
    user: data.user,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type
    },
    schools: memberships ?? []
  });
}));

router.post("/refresh", validate({ body: refreshSchema }), asyncHandler(async (req, res) => {
  const { data, error } = await createPublicClient().auth.refreshSession({ refresh_token: req.body.refresh_token });
  if (error || !data.session) throw new ApiError(401, "SESSION_REFRESH_FAILED", "Refresh token is invalid or expired");
  sendData(res, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type
  });
}));

router.get("/session", requireAuth, (req, res) => sendData(res, { user: req.auth!.user }));

router.post("/logout", requireAuth, validate({ body: logoutSchema }), asyncHandler(async (req, res) => {
  const client = createPublicClient();
  const { error: sessionError } = await client.auth.setSession({
    access_token: req.auth!.accessToken,
    refresh_token: req.body.refresh_token
  });
  if (sessionError) throw new ApiError(401, "AUTH_INVALID", "Session is invalid or expired");
  const { error } = await client.auth.signOut({ scope: "global" });
  if (error) throw new ApiError(503, "SERVER_UNAVAILABLE", "Unable to revoke session");
  res.status(204).send();
}));

export { router as authRouter };
