import type { RequestHandler } from "express";
import { z } from "zod";
import { ApiError, fromDatabaseError } from "../lib/errors.js";
import { asyncHandler } from "./async-handler.js";

const uuid = z.uuid();

type RoleRelation = { roles: { code: string } | Array<{ code: string }> | null };
type PermissionRelation = {
  roles: {
    role_permissions: Array<{ permissions: { code: string } | Array<{ code: string }> | null }>;
  } | Array<{
    role_permissions: Array<{ permissions: { code: string } | Array<{ code: string }> | null }>;
  }> | null;
};

const first = <T>(value: T | T[] | null): T | null => Array.isArray(value) ? (value[0] ?? null) : value;

export const requireTenant: RequestHandler = asyncHandler(async (req, _res, next) => {
  if (!req.auth) throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required");

  const parsed = uuid.safeParse(req.header("x-school-id"));
  if (!parsed.success) {
    throw new ApiError(400, "TENANT_REQUIRED", "A valid X-School-Id header is required");
  }

  if (req.auth.user.app_metadata?.platform_role === "SUPER_ADMIN" && !req.auth.user.app_metadata?.portal_access) {
    const { data: allowed, error: authorityError } = await req.auth.client.rpc("is_platform_admin");
    if (authorityError) throw fromDatabaseError(authorityError);
    if (allowed === true) {
      const { data: school, error: schoolError } = await req.auth.client.from("schools").select("id").eq("id", parsed.data).is("deleted_at", null).maybeSingle();
      if (schoolError) throw fromDatabaseError(schoolError);
      if (!school) throw new ApiError(404, "SCHOOL_NOT_FOUND", "School was not found");
      req.tenant = { schoolId: parsed.data, membershipId: req.auth.user.id, roles: ["SUPER_ADMIN"], permissions: [] };
      next(); return;
    }
  }

  const { data: membership, error } = await req.auth.client
    .from("school_users")
    .select("id")
    .eq("school_id", parsed.data)
    .eq("user_id", req.auth.user.id)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw fromDatabaseError(error);
  if (!membership) {
    console.log("REQUIRE_TENANT_FAILED", {
      xSchoolId: parsed.data,
      userId: req.auth.user.id,
      url: req.originalUrl,
      method: req.method
    });
    throw new ApiError(403, "FORBIDDEN", "No active membership for this school");
  }

  const { data: assignments, error: roleError } = await req.auth.client
    .from("school_user_roles")
    .select("roles(code, role_permissions(permissions(code)))")
    .eq("school_id", parsed.data)
    .eq("school_user_id", membership.id)
    .eq("roles.is_active", true).is("roles.deleted_at", null)
    .eq("roles.role_permissions.permissions.is_active", true).is("roles.role_permissions.permissions.deleted_at", null);
  if (roleError) throw fromDatabaseError(roleError);

  const roles = (assignments as RoleRelation[] | null ?? [])
    .map((assignment) => first(assignment.roles)?.code)
    .filter((code): code is string => Boolean(code) && code !== "SUPER_ADMIN");
  const permissions = (assignments as PermissionRelation[] | null ?? []).flatMap((assignment) => {
    const role = first(assignment.roles);
    return role?.role_permissions
      .map((grant) => first(grant.permissions)?.code)
      .filter((code): code is string => Boolean(code)) ?? [];
  });

  req.tenant = {
    schoolId: parsed.data,
    membershipId: membership.id as string,
    roles: [...new Set(roles)],
    permissions: [...new Set(permissions)]
  };
  next();
});

export const requirePermission = (permission: string): RequestHandler => (req, _res, next) => {
  if (req.tenant?.roles.includes("SUPER_ADMIN") || req.tenant?.roles.includes("SCHOOL_ADMIN")) {
    next();
    return;
  }
  if (!req.tenant?.permissions.includes(permission)) {
    next(new ApiError(403, "FORBIDDEN", `Permission '${permission}' is required`));
    return;
  }
  next();
};

export const requireRole = (role: string): RequestHandler => (req, _res, next) => {
  if (!req.tenant?.roles.includes(role) && !req.tenant?.roles.includes("SUPER_ADMIN")) {
    next(new ApiError(403, "FORBIDDEN", `Role '${role}' is required`));
    return;
  }
  next();
};
