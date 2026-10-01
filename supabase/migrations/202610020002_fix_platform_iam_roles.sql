CREATE OR REPLACE FUNCTION platform_get_iam(p_limit int, p_offset int)
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
  -- Verify SUPER_ADMIN role using auth.users app_meta_data
  SELECT EXISTS (
    SELECT 1 FROM auth.users au_check
    WHERE au_check.id = auth.uid() 
      AND au_check.raw_app_meta_data->>'platform_role' = 'SUPER_ADMIN'
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*) INTO v_total
  FROM school_users su
  WHERE su.deleted_at IS NULL;

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
  ORDER BY su.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_get_iam(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_get_iam(int, int) TO service_role;

-- Function to completely delete a school user and their auth if needed, or just delete from school_users
CREATE OR REPLACE FUNCTION platform_delete_school_user(p_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_super boolean;
BEGIN
  -- Verify SUPER_ADMIN role
  SELECT EXISTS (
    SELECT 1 FROM auth.users au_check
    WHERE au_check.id = auth.uid() 
      AND au_check.raw_app_meta_data->>'platform_role' = 'SUPER_ADMIN'
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Soft delete the school user
  UPDATE school_users
  SET deleted_at = now(),
      status = 'REVOKED'
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION platform_delete_school_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_delete_school_user(uuid) TO service_role;

