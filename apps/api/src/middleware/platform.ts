import type { RequestHandler } from 'express';
import { ApiError, fromDatabaseError } from '../lib/errors.js';
import { asyncHandler } from './async-handler.js';
export const requirePlatform: RequestHandler = asyncHandler(async (req, _res, next) => {
  const { data, error } = await req.auth!.client.rpc('is_platform_admin');
  if (error) throw fromDatabaseError(error);
  if (data !== true) throw new ApiError(403, 'FORBIDDEN', 'Platform administrator authority required');
  next();
});
