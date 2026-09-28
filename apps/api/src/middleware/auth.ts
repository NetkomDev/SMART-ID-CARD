import type { RequestHandler } from "express";
import { ApiError } from "../lib/errors.js";
import { createPublicClient, createUserClient } from "../lib/supabase.js";
import { asyncHandler } from "./async-handler.js";

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, "AUTH_REQUIRED", "Bearer access token is required");
  }

  const accessToken = match[1];
  const { data, error } = await createPublicClient().auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ApiError(401, "AUTH_INVALID", "Access token is invalid or expired");
  }

  const client = createUserClient(accessToken);
  if (data.user.app_metadata?.portal_access) {
    const { data: active, error: portalError } = await client.rpc("portal_session_active");
    if (portalError || !active) throw new ApiError(401, "PORTAL_ACCESS_INVALID", "Akses portal telah dinonaktifkan admin.");
  }
  req.auth = { accessToken, user: data.user, client };
  next();
});
