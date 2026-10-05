begin;

-- Relax students_nisn_format check constraint to allow NISN / NIS of 4 to 20 digits, or NULL
alter table public.students drop constraint if exists students_nisn_format;
alter table public.students add constraint students_nisn_format check (nisn is null or nisn ~ '^[0-9]{4,20}$');

commit;
