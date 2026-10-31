-- Migration: 202610310002_platform_iam_filter_and_portal_protection.sql
-- Description: Adds school_id filter to platform_get_iam, updates platform_update_membership and platform_delete_school_user with 3-month portal login protection and portal role support.

BEGIN;

-- 1. Drop existing platform_get_iam to safely redefine with optional school_id filter
DROP FUNCTION IF EXISTS public.platform_get_iam(int, int);
DROP FUNCTION IF EXISTS public.platform_get_iam(int, int, uuid);

CREATE OR REPLACE FUNCTION public.platform_get_iam(
  p_limit int, 
  p_offset int, 
  p_school_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  school_id uuid,
  user_id uuid,
  status varchar,
  full_name varchar,
  school_name varchar,
  last_sign_in_at timestamptz,
  roles jsonb,
  total_count bigint
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super boolean;
  v_total bigint;
BEGIN
  -- Verify SUPER_ADMIN role using auth.users app_metadata
  SELECT EXISTS (
    SELECT 1 FROM auth.users au_check
    WHERE au_check.id = auth.uid() 
      AND au_check.raw_app_meta_data->>'platform_role' = 'SUPER_ADMIN'
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Access denied: Super Admin authority required' USING errcode = '42501';
  END IF;

  SELECT count(*) INTO v_total
  FROM school_users su
  WHERE su.deleted_at IS NULL
    AND (p_school_id IS NULL OR su.school_id = p_school_id);

  RETURN QUERY
  SELECT 
    su.id,
    su.school_id,
    su.user_id,
    su.status::varchar,
    u.full_name::varchar,
    s.name::varchar,
    au.last_sign_in_at,
    (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'code', r.code,
          'permissions', (
            SELECT coalesce(jsonb_agg(p.code), '[]'::jsonb)
            FROM role_permissions rp
            JOIN permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = r.id
          )
        )
      ), '[]'::jsonb)
      FROM school_user_roles sur
      JOIN roles r ON r.id = sur.role_id
      WHERE sur.school_user_id = su.id
    ) AS roles,
    v_total AS total_count
  FROM school_users su
  JOIN users u ON u.id = su.user_id
  JOIN schools s ON s.id = su.school_id
  LEFT JOIN auth.users au ON au.id = su.user_id
  WHERE su.deleted_at IS NULL
    AND (p_school_id IS NULL OR su.school_id = p_school_id)
  ORDER BY su.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_get_iam(int, int, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_iam(int, int, uuid) TO service_role;


-- 2. Update platform_update_membership with portal roles and 3-month protection
CREATE OR REPLACE FUNCTION public.platform_update_membership(
  p_id uuid,
  p_status public.membership_status,
  p_roles text[]
) 
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = pg_catalog, public 
AS $$
DECLARE 
  m public.school_users;
  v_is_portal boolean := false;
  v_last_sign_in timestamptz;
  v_allowed_roles text[] := array[
    'SCHOOL_ADMIN',
    'TEACHER',
    'EXTRA_TEACHER',
    'LIBRARY_STAFF',
    'WASTE_STAFF',
    'PARENT',
    'PORTAL_TEACHER',
    'PORTAL_EXTRA_TEACHER',
    'PORTAL_LIBRARY_STAFF',
    'PORTAL_WASTE_STAFF',
    'PORTAL_PARENT'
  ];
BEGIN
  IF NOT public.is_platform_admin() THEN 
    RAISE EXCEPTION 'Platform authority required' USING errcode = '42501';
  END IF;

  IF p_status IS NULL OR p_roles IS NULL OR p_status NOT IN ('ACTIVE','SUSPENDED','REVOKED') 
     OR cardinality(p_roles) < 1 OR NOT p_roles <@ v_allowed_roles THEN 
    RAISE EXCEPTION 'Invalid role or status: %', p_roles USING errcode = '22023';
  END IF;

  SELECT * INTO m FROM public.school_users WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION 'Membership not found' USING errcode = 'P0002';
  END IF;

  PERFORM 1 FROM public.schools WHERE id = m.school_id FOR UPDATE;

  -- Detect portal role & last sign in time
  SELECT 
    EXISTS (
      SELECT 1 FROM public.school_user_roles sur
      JOIN public.roles r ON r.id = sur.role_id
      WHERE sur.school_user_id = m.id
        AND (r.code LIKE 'PORTAL_%' OR r.code IN ('WASTE_STAFF','TEACHER','PARENT','LIBRARY_STAFF'))
    ) OR coalesce(au.raw_app_meta_data->>'portal_access','false') = 'true',
    au.last_sign_in_at
  INTO v_is_portal, v_last_sign_in
  FROM auth.users au
  WHERE au.id = m.user_id;

  -- 3-Month login protection: If user is portal and attempting to deactivate (ACTIVE -> SUSPENDED/REVOKED)
  IF v_is_portal AND m.status = 'ACTIVE' AND p_status IN ('SUSPENDED', 'REVOKED') THEN
    IF v_last_sign_in IS NOT NULL AND v_last_sign_in > (now() - interval '3 months') THEN
      RAISE EXCEPTION 'PORTAL_ACTIVE_RECENTLY: Hak akses Portal tidak dapat dinonaktifkan karena pengguna masih aktif login dalam 3 bulan terakhir (terakhir login: %).' , to_char(v_last_sign_in, 'YYYY-MM-DD HH24:MI:SS')
      USING errcode = '23514';
    END IF;
  END IF;

  -- Safety check for at least one active school admin
  IF EXISTS (
    SELECT 1 FROM public.school_user_roles a 
    JOIN public.roles r ON r.id = a.role_id 
    WHERE a.school_user_id = m.id AND r.code = 'SCHOOL_ADMIN'
  ) AND (p_status <> 'ACTIVE' OR NOT 'SCHOOL_ADMIN' = ANY(p_roles)) AND NOT EXISTS (
    SELECT 1 FROM public.school_users x 
    JOIN public.school_user_roles a ON a.school_user_id = x.id 
    JOIN public.roles r ON r.id = a.role_id 
    WHERE x.school_id = m.school_id AND x.id <> m.id AND x.status = 'ACTIVE' AND x.deleted_at IS NULL AND r.code = 'SCHOOL_ADMIN'
  ) THEN 
    RAISE EXCEPTION 'At least one active school administrator is required';
  END IF;

  UPDATE public.school_users 
  SET status = p_status, joined_at = coalesce(joined_at, now()) 
  WHERE id = m.id;

  DELETE FROM public.school_user_roles WHERE school_user_id = m.id;

  INSERT INTO public.school_user_roles(school_id, school_user_id, role_id, assigned_by) 
  SELECT m.school_id, m.id, r.id, auth.uid() 
  FROM public.roles r 
  WHERE r.school_id = m.school_id AND r.code = ANY(p_roles) AND r.is_active AND r.deleted_at IS NULL;

  INSERT INTO public.audit_logs(school_id, actor_user_id, action, resource_type, resource_id, before_data, after_data) 
  VALUES(
    m.school_id, 
    auth.uid(), 
    'MEMBERSHIP_ACCESS_UPDATED', 
    'school_users', 
    m.id, 
    jsonb_build_object('status', m.status), 
    jsonb_build_object('status', p_status, 'roles', p_roles)
  );

  RETURN jsonb_build_object('id', m.id, 'status', p_status, 'roles', p_roles);
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_update_membership(uuid, public.membership_status, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_membership(uuid, public.membership_status, text[]) TO service_role;


-- 3. Update platform_delete_school_user with 3-month portal protection
CREATE OR REPLACE FUNCTION public.platform_delete_school_user(p_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super boolean;
  m public.school_users;
  v_is_portal boolean := false;
  v_last_sign_in timestamptz;
BEGIN
  -- Verify SUPER_ADMIN role
  SELECT EXISTS (
    SELECT 1 FROM auth.users au_check
    WHERE au_check.id = auth.uid() 
      AND au_check.raw_app_meta_data->>'platform_role' = 'SUPER_ADMIN'
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Access denied: Super Admin authority required' USING errcode = '42501';
  END IF;

  SELECT * INTO m FROM public.school_users WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION 'Membership not found' USING errcode = 'P0002';
  END IF;

  -- Safety check for at least one active school admin
  IF EXISTS (
    SELECT 1 FROM public.school_user_roles a 
    JOIN public.roles r ON r.id = a.role_id 
    WHERE a.school_user_id = m.id AND r.code = 'SCHOOL_ADMIN'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.school_users x 
    JOIN public.school_user_roles a ON a.school_user_id = x.id 
    JOIN public.roles r ON r.id = a.role_id 
    WHERE x.school_id = m.school_id AND x.id <> m.id AND x.status = 'ACTIVE' AND x.deleted_at IS NULL AND r.code = 'SCHOOL_ADMIN'
  ) THEN 
    RAISE EXCEPTION 'At least one active school administrator is required';
  END IF;

  -- Detect portal role & last sign in time
  SELECT 
    EXISTS (
      SELECT 1 FROM public.school_user_roles sur
      JOIN public.roles r ON r.id = sur.role_id
      WHERE sur.school_user_id = m.id
        AND (r.code LIKE 'PORTAL_%' OR r.code IN ('WASTE_STAFF','TEACHER','PARENT','LIBRARY_STAFF'))
    ) OR coalesce(au.raw_app_meta_data->>'portal_access','false') = 'true',
    au.last_sign_in_at
  INTO v_is_portal, v_last_sign_in
  FROM auth.users au
  WHERE au.id = m.user_id;

  -- 3-Month login protection: If user is portal and has logged in within 3 months, deletion is blocked
  IF v_is_portal THEN
    IF v_last_sign_in IS NOT NULL AND v_last_sign_in > (now() - interval '3 months') THEN
      RAISE EXCEPTION 'PORTAL_ACTIVE_RECENTLY: Hak akses Portal tidak dapat dihapus karena pengguna masih aktif login dalam 3 bulan terakhir (terakhir login: %).' , to_char(v_last_sign_in, 'YYYY-MM-DD HH24:MI:SS')
      USING errcode = '23514';
    END IF;
  END IF;

  -- Soft delete the school user
  UPDATE public.school_users
  SET deleted_at = now(),
      status = 'REVOKED'
  WHERE id = p_id;

  -- Revoke any active qr access tokens associated with this user and school
  UPDATE public.qr_access_tokens
  SET revoked_at = now()
  WHERE auth_user_id = m.user_id 
    AND school_id = m.school_id 
    AND revoked_at IS NULL;

  -- Audit log the deletion
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, resource_type, resource_id, before_data, after_data)
  VALUES(
    m.school_id,
    auth.uid(),
    'MEMBERSHIP_DELETED',
    'school_users',
    m.id,
    jsonb_build_object('user_id', m.user_id, 'status', m.status),
    jsonb_build_object('status', 'REVOKED', 'deleted_at', now())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_delete_school_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_school_user(uuid) TO service_role;

COMMIT;
