-- Migration: 202610310003_sync_portal_iam_and_school_admin.sql
-- Description: Synchronizes Super Admin IAM and School Admin Portal Access.
-- 1. Updates platform_get_iam to filter out portal users whose QR token has been deleted.
-- 2. Updates platform_delete_school_user to delete qr_access_tokens on deletion.
-- 3. Updates revoke_portal_access to enforce 3-month login protection.
-- 4. Cleans up orphaned portal users in school_users.

-- 1. Redefine platform_get_iam
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
  JOIN users u ON u.id = su.user_id
  LEFT JOIN auth.users au ON au.id = su.user_id
  WHERE su.deleted_at IS NULL
    AND (p_school_id IS NULL OR su.school_id = p_school_id)
    AND (
      NOT (
        u.full_name LIKE 'Portal %' 
        OR coalesce(au.raw_app_meta_data->>'portal_access','false') = 'true'
        OR EXISTS (
          SELECT 1 FROM school_user_roles sur
          JOIN roles r ON r.id = sur.role_id
          WHERE sur.school_user_id = su.id AND (r.code LIKE 'PORTAL_%' OR r.code IN ('WASTE_STAFF','TEACHER','PARENT','LIBRARY_STAFF'))
        )
      )
      OR EXISTS (
        SELECT 1 FROM qr_access_tokens q 
        WHERE q.auth_user_id = su.user_id
      )
    );

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
    AND (
      NOT (
        u.full_name LIKE 'Portal %' 
        OR coalesce(au.raw_app_meta_data->>'portal_access','false') = 'true'
        OR EXISTS (
          SELECT 1 FROM school_user_roles sur
          JOIN roles r ON r.id = sur.role_id
          WHERE sur.school_user_id = su.id AND (r.code LIKE 'PORTAL_%' OR r.code IN ('WASTE_STAFF','TEACHER','PARENT','LIBRARY_STAFF'))
        )
      )
      OR EXISTS (
        SELECT 1 FROM qr_access_tokens q 
        WHERE q.auth_user_id = su.user_id
      )
    )
  ORDER BY su.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 2. Update platform_delete_school_user to synchronize qr_access_tokens
CREATE OR REPLACE FUNCTION public.platform_delete_school_user(
  p_id uuid
)
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

  -- Delete associated qr_access_tokens so that School Admin view removes it as well
  DELETE FROM public.qr_access_tokens
  WHERE auth_user_id = m.user_id 
    AND school_id = m.school_id;

  -- Audit log the deletion
  INSERT INTO public.audit_logs(school_id, actor_user_id, action, resource_type, resource_id, before_data, after_data)
  VALUES(
    m.school_id,
    auth.uid(),
    'SCHOOL_USER_DELETED',
    'school_users',
    m.id,
    jsonb_build_object('id', m.id, 'user_id', m.user_id, 'status', m.status),
    jsonb_build_object('id', m.id, 'deleted_at', now(), 'status', 'REVOKED')
  );
END;
$$;

-- 3. Update revoke_portal_access to enforce 3-month login protection
CREATE OR REPLACE FUNCTION public.revoke_portal_access(p_token_id uuid) 
RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = pg_catalog, public 
AS $$
DECLARE 
  q public.qr_access_tokens;
  v_last_sign_in timestamptz;
BEGIN
  SELECT * INTO q FROM public.qr_access_tokens WHERE id = p_token_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_portal_access(q.school_id) THEN 
    RAISE EXCEPTION 'Akses ditolak' USING errcode = '42501'; 
  END IF;

  -- Check if user logged in within last 3 months
  SELECT au.last_sign_in_at INTO v_last_sign_in
  FROM auth.users au
  WHERE au.id = q.auth_user_id;

  IF v_last_sign_in IS NOT NULL AND v_last_sign_in > (now() - interval '3 months') THEN
    RAISE EXCEPTION 'PORTAL_ACTIVE_RECENTLY: Hak akses Portal tidak dapat dinonaktifkan karena pengguna masih aktif login dalam 3 bulan terakhir (terakhir login: %).', to_char(v_last_sign_in, 'YYYY-MM-DD HH24:MI:SS')
    USING errcode = '23514';
  END IF;

  UPDATE public.qr_access_tokens SET revoked_at = now() WHERE id = q.id;
  UPDATE public.school_users SET status = 'REVOKED' WHERE user_id = q.auth_user_id AND school_id = q.school_id;
  UPDATE public.parent_student_links SET status = 'REVOKED', revoked_at = now() WHERE parent_user_id = q.auth_user_id AND school_id = q.school_id;
END $$;

-- 4. Clean up existing orphaned portal records in school_users
UPDATE public.school_users su
SET deleted_at = now(), status = 'REVOKED'
FROM public.users u
WHERE u.id = su.user_id
  AND su.deleted_at IS NULL
  AND (
    u.full_name LIKE 'Portal %'
    OR EXISTS (
      SELECT 1 FROM school_user_roles sur
      JOIN roles r ON r.id = sur.role_id
      WHERE sur.school_user_id = su.id AND (r.code LIKE 'PORTAL_%' OR r.code IN ('WASTE_STAFF','TEACHER','PARENT','LIBRARY_STAFF'))
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM qr_access_tokens q
    WHERE q.auth_user_id = su.user_id
  );

UPDATE public.users u
SET deleted_at = now(), is_active = false
WHERE u.deleted_at IS NULL
  AND u.full_name LIKE 'Portal %'
  AND NOT EXISTS (
    SELECT 1 FROM qr_access_tokens q
    WHERE q.auth_user_id = u.id
  );
