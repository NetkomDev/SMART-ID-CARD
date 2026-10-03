-- Migration: High performance indexes for Card Production queries
begin;

-- Index for candidates query on students (school_id, is_active, deleted_at, full_name)
create index if not exists idx_students_production_lookup 
on public.students USING btree (school_id, is_active, full_name) 
where (deleted_at is null);

-- Compound index for student_cards by school and student for status lookups
create index if not exists idx_student_cards_prod_lookup 
on public.student_cards USING btree (school_id, student_id, production_status, status);

-- Compound index for student_class_history current class lookup
create index if not exists idx_student_class_history_prod 
on public.student_class_history USING btree (school_id, student_id, is_current, class_id);

-- Index for card_batches ordered listing
create index if not exists idx_card_batches_created 
on public.card_batches USING btree (school_id, created_at desc);

notify pgrst, 'reload schema';
commit;
