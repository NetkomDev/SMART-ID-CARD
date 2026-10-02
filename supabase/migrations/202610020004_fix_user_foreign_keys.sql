begin;

ALTER TABLE public.platform_operations DROP CONSTRAINT IF EXISTS platform_operations_actor_id_fkey;
ALTER TABLE public.platform_operations ADD CONSTRAINT platform_operations_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.platform_operations DROP CONSTRAINT IF EXISTS platform_operations_user_id_fkey;
ALTER TABLE public.platform_operations ADD CONSTRAINT platform_operations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_user_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.card_batches DROP CONSTRAINT IF EXISTS card_batches_created_by_fkey;
ALTER TABLE public.card_batches ADD CONSTRAINT card_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.card_print_events DROP CONSTRAINT IF EXISTS card_print_events_actor_id_fkey;
ALTER TABLE public.card_print_events ADD CONSTRAINT card_print_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.qr_access_tokens DROP CONSTRAINT IF EXISTS qr_access_tokens_created_by_fkey;
ALTER TABLE public.qr_access_tokens ADD CONSTRAINT qr_access_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.card_write_jobs DROP CONSTRAINT IF EXISTS card_write_jobs_created_by_fkey;
ALTER TABLE public.card_write_jobs ADD CONSTRAINT card_write_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.extracurricular_sessions DROP CONSTRAINT IF EXISTS extracurricular_sessions_created_by_fkey;
ALTER TABLE public.extracurricular_sessions ADD CONSTRAINT extracurricular_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.extracurricular_members DROP CONSTRAINT IF EXISTS extracurricular_members_enrolled_by_fkey;
ALTER TABLE public.extracurricular_members ADD CONSTRAINT extracurricular_members_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.extracurricular_attendance DROP CONSTRAINT IF EXISTS extracurricular_attendance_recorded_by_fkey;
ALTER TABLE public.extracurricular_attendance ADD CONSTRAINT extracurricular_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.led_content DROP CONSTRAINT IF EXISTS led_content_created_by_fkey;
ALTER TABLE public.led_content ADD CONSTRAINT led_content_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.waste_transactions DROP CONSTRAINT IF EXISTS waste_transactions_staff_user_id_fkey;
ALTER TABLE public.waste_transactions ADD CONSTRAINT waste_transactions_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

commit;
