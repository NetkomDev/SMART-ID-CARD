-- Migration: 202610110001_database_indexing_and_perf_optimization.sql
-- Optimizes query performance, resolves unindexed foreign keys, eliminates duplicate index, and tunes RLS initplan evaluation.

-- ============================================================================
-- 1. DROP DUPLICATE INDEX
-- ============================================================================
DROP INDEX IF EXISTS public.parent_student_links_multi_device_idx;

-- ============================================================================
-- 2. COVERING INDEXES FOR FOREIGN KEYS (BOOSTING JOINS & CASCADES)
-- ============================================================================

-- attendance_event_receipts
CREATE INDEX IF NOT EXISTS idx_attendance_event_receipts_attendance_id 
  ON public.attendance_event_receipts (attendance_id);

-- attendance_logs
CREATE INDEX IF NOT EXISTS idx_attendance_logs_school_card 
  ON public.attendance_logs (school_id, card_id);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id 
  ON public.audit_logs (actor_user_id);

-- card_batches
CREATE INDEX IF NOT EXISTS idx_card_batches_created_by 
  ON public.card_batches (created_by);

CREATE INDEX IF NOT EXISTS idx_card_batches_school_class_year 
  ON public.card_batches (school_id, class_id, academic_year_id);

-- card_print_events
CREATE INDEX IF NOT EXISTS idx_card_print_events_actor_id 
  ON public.card_print_events (actor_id);

CREATE INDEX IF NOT EXISTS idx_card_print_events_school_batch 
  ON public.card_print_events (school_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_card_print_events_school_id 
  ON public.card_print_events (school_id);

-- card_write_jobs
CREATE INDEX IF NOT EXISTS idx_card_write_jobs_created_by 
  ON public.card_write_jobs (created_by);

CREATE INDEX IF NOT EXISTS idx_card_write_jobs_school_card 
  ON public.card_write_jobs (school_id, card_id);

CREATE INDEX IF NOT EXISTS idx_card_write_jobs_school_leased_device 
  ON public.card_write_jobs (school_id, leased_by_device_id);

-- card_write_logs
CREATE INDEX IF NOT EXISTS idx_card_write_logs_school_device 
  ON public.card_write_logs (school_id, device_id);

-- classes
CREATE INDEX IF NOT EXISTS idx_classes_homeroom_teacher 
  ON public.classes (homeroom_teacher_user_id);

-- device_credentials
CREATE INDEX IF NOT EXISTS idx_device_credentials_school_device 
  ON public.device_credentials (school_id, device_id);

CREATE INDEX IF NOT EXISTS idx_device_credentials_school_id 
  ON public.device_credentials (school_id);

-- extracurricular_attendance
CREATE INDEX IF NOT EXISTS idx_extracurricular_attendance_recorded_by 
  ON public.extracurricular_attendance (recorded_by);

CREATE INDEX IF NOT EXISTS idx_extracurricular_attendance_school_ekskul_student 
  ON public.extracurricular_attendance (school_id, extracurricular_id, student_id);

CREATE INDEX IF NOT EXISTS idx_extracurricular_attendance_school_session_ekskul 
  ON public.extracurricular_attendance (school_id, session_id, extracurricular_id);

-- extracurricular_members
CREATE INDEX IF NOT EXISTS idx_extracurricular_members_enrolled_by 
  ON public.extracurricular_members (enrolled_by);

-- extracurricular_sessions
CREATE INDEX IF NOT EXISTS idx_extracurricular_sessions_created_by 
  ON public.extracurricular_sessions (created_by);

CREATE INDEX IF NOT EXISTS idx_extracurricular_sessions_school_ekskul 
  ON public.extracurricular_sessions (school_id, extracurricular_id);

-- led_acknowledgements
CREATE INDEX IF NOT EXISTS idx_led_acknowledgements_school_content 
  ON public.led_acknowledgements (school_id, content_id);

-- led_content
CREATE INDEX IF NOT EXISTS idx_led_content_created_by 
  ON public.led_content (created_by);

-- led_gateway_heartbeats
CREATE INDEX IF NOT EXISTS idx_led_gateway_heartbeats_school_cached_content 
  ON public.led_gateway_heartbeats (school_id, cached_content_id);

-- library_events
CREATE INDEX IF NOT EXISTS idx_library_events_school_id 
  ON public.library_events (school_id);

-- library_visits
CREATE INDEX IF NOT EXISTS idx_library_visits_school_student 
  ON public.library_visits (school_id, student_id);

-- parent_link_tokens
CREATE INDEX IF NOT EXISTS idx_parent_link_tokens_created_by 
  ON public.parent_link_tokens (created_by);

CREATE INDEX IF NOT EXISTS idx_parent_link_tokens_school_id 
  ON public.parent_link_tokens (school_id);

-- parent_student_links
CREATE INDEX IF NOT EXISTS idx_parent_student_links_parent_user 
  ON public.parent_student_links (parent_user_id);

-- platform_operations
CREATE INDEX IF NOT EXISTS idx_platform_operations_actor_id 
  ON public.platform_operations (actor_id);

CREATE INDEX IF NOT EXISTS idx_platform_operations_school_id 
  ON public.platform_operations (school_id);

CREATE INDEX IF NOT EXISTS idx_platform_operations_user_id 
  ON public.platform_operations (user_id);

-- qr_access_tokens
CREATE INDEX IF NOT EXISTS idx_qr_access_tokens_created_by 
  ON public.qr_access_tokens (created_by);

CREATE INDEX IF NOT EXISTS idx_qr_access_tokens_school_id 
  ON public.qr_access_tokens (school_id);

-- school_user_roles
CREATE INDEX IF NOT EXISTS idx_school_user_roles_assigned_by 
  ON public.school_user_roles (assigned_by);

-- student_absence_permits
CREATE INDEX IF NOT EXISTS idx_student_absence_permits_parent_user 
  ON public.student_absence_permits (parent_user_id);

-- student_cards
CREATE INDEX IF NOT EXISTS idx_student_cards_school_batch 
  ON public.student_cards (school_id, batch_id);

CREATE INDEX IF NOT EXISTS idx_student_cards_school_replaces_card 
  ON public.student_cards (school_id, replaces_card_id);

-- student_class_history
CREATE INDEX IF NOT EXISTS idx_student_class_history_school_class_year 
  ON public.student_class_history (school_id, class_id, academic_year_id);

-- students
CREATE INDEX IF NOT EXISTS idx_students_deleted_by 
  ON public.students (deleted_by);

-- waste_transactions
CREATE INDEX IF NOT EXISTS idx_waste_transactions_staff_user 
  ON public.waste_transactions (staff_user_id);

-- ============================================================================
-- 3. OPTIMIZE RLS POLICIES (AVOID PER-ROW SUBQUERY RE-EVALUATION)
-- ============================================================================

-- users
DROP POLICY IF EXISTS "users_select_self" ON public.users;
CREATE POLICY "users_select_self" ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users_update_self" ON public.users;
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- parent_profiles
DROP POLICY IF EXISTS "parent_profiles_self" ON public.parent_profiles;
CREATE POLICY "parent_profiles_self" ON public.parent_profiles
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- parent_student_links
DROP POLICY IF EXISTS "parent_links_self_select" ON public.parent_student_links;
CREATE POLICY "parent_links_self_select" ON public.parent_student_links
  FOR SELECT TO authenticated
  USING (parent_user_id = (SELECT auth.uid()));

-- waste_transactions
DROP POLICY IF EXISTS "waste_create" ON public.waste_transactions;
CREATE POLICY "waste_create" ON public.waste_transactions
  FOR INSERT TO authenticated
  WITH CHECK (has_school_permission(school_id, 'waste.create'::text) AND (staff_user_id = (SELECT auth.uid())));

-- card_write_jobs
DROP POLICY IF EXISTS "card_write_jobs_create" ON public.card_write_jobs;
CREATE POLICY "card_write_jobs_create" ON public.card_write_jobs
  FOR INSERT TO authenticated
  WITH CHECK (has_school_permission(school_id, 'card.write'::text) AND (created_by = (SELECT auth.uid())));

-- qr_access_tokens
DROP POLICY IF EXISTS "Admins can manage qr access tokens" ON public.qr_access_tokens;
CREATE POLICY "Admins can manage qr access tokens" ON public.qr_access_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM school_users su
      JOIN school_user_roles sur ON sur.school_user_id = su.id
      JOIN roles r ON r.id = sur.role_id
      WHERE su.user_id = (SELECT auth.uid())
        AND su.school_id = qr_access_tokens.school_id
        AND r.code::text = ANY (ARRAY['SUPER_ADMIN'::character varying, 'SCHOOL_ADMIN'::character varying]::text[])
    )
  );

-- student_absence_permits
DROP POLICY IF EXISTS "student_absence_permits_parent_all" ON public.student_absence_permits;
CREATE POLICY "student_absence_permits_parent_all" ON public.student_absence_permits
  FOR ALL TO authenticated
  USING (parent_user_id = (SELECT auth.uid()))
  WITH CHECK (parent_user_id = (SELECT auth.uid()));
