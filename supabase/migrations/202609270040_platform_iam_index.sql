-- Optimize platform IAM cross-tenant pagination
CREATE INDEX IF NOT EXISTS platform_school_users_created_at_idx 
ON public.school_users (created_at DESC) 
WHERE deleted_at IS NULL;
