import type { ErrorRequestHandler, RequestHandler } from "express";
import { ApiError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, "ROUTE_NOT_FOUND", `Route ${req.method} ${req.path} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const expressError = error as { status?: number; type?: string };
  const apiError = error instanceof ApiError
    ? error
    : expressError.type === "entity.parse.failed"
      ? new ApiError(400, "INVALID_JSON", "Request body contains invalid JSON")
      : expressError.type === "entity.too.large"
        ? new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds the 1 MB limit")
        : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred");

  if (apiError.status >= 500) {
    logger.error({ err: error, requestId: req.requestId }, "request failed");
  }

  res.status(apiError.status).json({
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details })
    },
    request_id: req.requestId
  });
};
