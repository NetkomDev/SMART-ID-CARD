import type { PostgrestError } from "@supabase/supabase-js";

export type ErrorCode =
  // Phase 03: authentication, tenant context, and core resources.
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "INVALID_CREDENTIALS"
  | "SESSION_REFRESH_FAILED"
  | "FORBIDDEN"
  | "TENANT_REQUIRED"
  | "SCHOOL_NOT_FOUND"
  | "CLASS_NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  // Phase 04: academic lifecycle and card management.
  | "ACADEMIC_YEAR_NOT_FOUND"
  | "CARD_NOT_FOUND"
  // Phase 05: device provisioning and runtime authentication.
  | "DEVICE_NOT_REGISTERED"
  | "DEVICE_AUTH_INVALID"
  // Phase 06: gate eligibility, card/student state, and rule validation.
  | "DEVICE_NOT_GATE"
  | "ATTENDANCE_DISABLED"
  | "CARD_BLOCKED"
  | "STUDENT_INACTIVE"
  | "GATE_RULE_VIOLATION"
  | "PARENT_LINK_INVALID"
  | "CHILD_NOT_LINKED"
  | "RESOURCE_NOT_FOUND"
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
  if (error.code === "28000") {
    return new ApiError(401, "DEVICE_AUTH_INVALID", "Device credential is invalid or expired");
  }
  if (error.code === "P0002") {
    return new ApiError(404, "RESOURCE_NOT_FOUND", "Referenced resource was not found");
  }
  if (error.code === "AG002") {
    return new ApiError(403, "DEVICE_NOT_GATE", "Device is not registered for gate attendance");
  }
  if (error.code === "AG003") {
    return new ApiError(403, "ATTENDANCE_DISABLED", "Gate attendance is disabled for this device");
  }
  if (error.code === "AG004") {
    return new ApiError(404, "CARD_NOT_FOUND", "Card was not found for this school");
  }
  if (error.code === "AG005") {
    return new ApiError(422, "CARD_BLOCKED", "Card is blocked, inactive, or expired");
  }
  if (error.code === "AG006") {
    return new ApiError(422, "STUDENT_INACTIVE", "Student is inactive");
  }
  if (error.code === "AG007") {
    return new ApiError(422, "GATE_RULE_VIOLATION", "Attendance event violates gate rules");
  }
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
