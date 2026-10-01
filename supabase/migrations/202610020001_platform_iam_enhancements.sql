-- Add a secure view for Platform IAM to access auth.users.last_sign_in_at
CREATE OR REPLACE VIEW platform_iam_view
WITH (security_invoker = off) -- Runs as the view owner (postgres), so it can read auth.users
AS
SELECT 
  su.id,
  su.school_id,
  su.user_id,
  su.status,
  u.full_name,
  s.name AS school_name,
  au.last_sign_in_at,
  su.created_at,
  su.deleted_at,
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
  ) AS roles
FROM school_users su
JOIN users u ON u.id = su.user_id
JOIN schools s ON s.id = su.school_id
LEFT JOIN auth.users au ON au.id = su.user_id
WHERE su.deleted_at IS NULL;

-- Grant access to authenticated users
GRANT SELECT ON platform_iam_view TO authenticated;

-- Ensure only super admins can see the data
ALTER VIEW platform_iam_view OWNER TO postgres;

-- Add RLS policy equivalent via a wrapper function since views with security_invoker=off bypass RLS
-- Actually, a better approach is a security definer function instead of a view to ensure strict access control.

DROP VIEW IF EXISTS platform_iam_view;

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
  -- Verify SUPER_ADMIN role
  SELECT EXISTS (
    SELECT 1 FROM platform_user_roles pur
    JOIN roles r ON r.id = pur.role_id
    WHERE pur.user_id = auth.uid() AND r.code = 'SUPER_ADMIN'
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
    SELECT 1 FROM platform_user_roles pur
    JOIN roles r ON r.id = pur.role_id
    WHERE pur.user_id = auth.uid() AND r.code = 'SUPER_ADMIN'
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
