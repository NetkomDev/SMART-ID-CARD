import type { PostgrestError } from "@supabase/supabase-js";

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "INVALID_CREDENTIALS"
  | "SESSION_REFRESH_FAILED"
  | "FORBIDDEN"
  | "TENANT_REQUIRED"
  | "SCHOOL_NOT_FOUND"
  | "CLASS_NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  | "INVALID_JSON"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ROUTE_NOT_FOUND"
  | "DATABASE_ERROR"
  | "SERVER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function fromDatabaseError(error: PostgrestError): ApiError {
  if (error.code === "42501") {
    return new ApiError(403, "FORBIDDEN", "Database policy denied this operation");
  }
  if (error.code === "23505") {
    return new ApiError(409, "CONFLICT", "Resource already exists");
  }
  if (error.code === "23503" || error.code === "23514") {
    return new ApiError(422, "VALIDATION_ERROR", "Resource violates a data constraint");
  }
  return new ApiError(500, "DATABASE_ERROR", "Database operation failed");
}
