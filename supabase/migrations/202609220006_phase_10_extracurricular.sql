begin;

create type public.extracurricular_session_status as enum ('SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED');
create type public.extracurricular_member_status as enum ('ACTIVE', 'INACTIVE');
create type public.extracurricular_attendance_status as enum ('PRESENT', 'EXCUSED', 'ABSENT');

create table public.extracurriculars (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  code varchar(32) not null, name varchar(120) not null, description text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (school_id, id), unique (school_id, code),
  check (btrim(code) <> '' and btrim(name) <> '')
);
create table public.extracurricular_sessions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), extracurricular_id uuid not null,
  name varchar(120) not null, starts_at timestamptz not null, ends_at timestamptz not null,
  status public.extracurricular_session_status not null default 'SCHEDULED', created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, id), unique (school_id, id, extracurricular_id),
  foreign key (school_id, extracurricular_id) references public.extracurriculars(school_id, id),
  check (ends_at > starts_at and btrim(name) <> '')
);
create table public.extracurricular_members (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), extracurricular_id uuid not null,
  student_id uuid not null, status public.extracurricular_member_status not null default 'ACTIVE',
  enrolled_by uuid not null references public.users(id), enrolled_at timestamptz not null default now(),
  idempotency_key uuid not null, created_at timestamptz not null default now(),
  unique (school_id, id), unique (school_id, extracurricular_id, student_id), unique (school_id, idempotency_key),
  foreign key (school_id, extracurricular_id) references public.extracurriculars(school_id, id),
  foreign key (school_id, student_id) references public.students(school_id, id)
);
create table public.extracurricular_attendance (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), extracurricular_id uuid not null,
  session_id uuid not null, student_id uuid not null, status public.extracurricular_attendance_status not null,
  recorded_by uuid not null references public.users(id), recorded_at timestamptz not null default now(), notes varchar(500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, session_id, student_id),
  foreign key (school_id, session_id, extracurricular_id) references public.extracurricular_sessions(school_id, id, extracurricular_id),
  foreign key (school_id, extracurricular_id, student_id) references public.extracurricular_members(school_id, extracurricular_id, student_id)
);
create table public.extracurricular_events (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  event_type varchar(80) not null, aggregate_id uuid not null, payload jsonb not null,
  occurred_at timestamptz not null default now(), published_at timestamptz,
  unique (school_id, id)
);

create index extracurricular_sessions_schedule_idx on public.extracurricular_sessions(school_id, starts_at desc);
create index extracurricular_members_student_idx on public.extracurricular_members(school_id, student_id);
create index extracurricular_attendance_session_idx on public.extracurricular_attendance(school_id, session_id, status);
create index extracurricular_events_pending_idx on public.extracurricular_events(occurred_at) where published_at is null;

create function public.emit_extracurricular_event() returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.extracurricular_events(school_id, event_type, aggregate_id, payload)
  values (new.school_id, tg_argv[0], new.id, to_jsonb(new));
  return new;
end $$;
create trigger extracurricular_member_enrolled after insert on public.extracurricular_members
for each row execute function public.emit_extracurricular_event('extracurricular.member.enrolled');
create trigger extracurricular_attendance_recorded after insert on public.extracurricular_attendance
for each row execute function public.emit_extracurricular_event('extracurricular.attendance.recorded');

create trigger extracurriculars_updated_at before update on public.extracurriculars for each row execute function public.set_updated_at();
create trigger extracurricular_sessions_updated_at before update on public.extracurricular_sessions for each row execute function public.set_updated_at();
create trigger extracurricular_attendance_updated_at before update on public.extracurricular_attendance for each row execute function public.set_updated_at();

alter table public.extracurriculars enable row level security; alter table public.extracurriculars force row level security;
alter table public.extracurricular_sessions enable row level security; alter table public.extracurricular_sessions force row level security;
alter table public.extracurricular_members enable row level security; alter table public.extracurricular_members force row level security;
alter table public.extracurricular_attendance enable row level security; alter table public.extracurricular_attendance force row level security;
alter table public.extracurricular_events enable row level security; alter table public.extracurricular_events force row level security;

create policy extracurricular_read on public.extracurriculars for select to authenticated using (public.has_school_permission(school_id, 'extracurricular.read'));
create policy extracurricular_manage on public.extracurriculars for all to authenticated using (public.has_school_permission(school_id, 'extracurricular.manage')) with check (public.has_school_permission(school_id, 'extracurricular.manage'));
create policy extracurricular_sessions_read on public.extracurricular_sessions for select to authenticated using (public.has_school_permission(school_id, 'extracurricular.read'));
create policy extracurricular_sessions_manage on public.extracurricular_sessions for all to authenticated using (public.has_school_permission(school_id, 'extracurricular.manage')) with check (public.has_school_permission(school_id, 'extracurricular.manage'));
create policy extracurricular_members_read on public.extracurricular_members for select to authenticated using (public.has_school_permission(school_id, 'extracurricular.read'));
create policy extracurricular_members_manage on public.extracurricular_members for all to authenticated using (public.has_school_permission(school_id, 'extracurricular.manage')) with check (public.has_school_permission(school_id, 'extracurricular.manage'));
create policy extracurricular_attendance_read on public.extracurricular_attendance for select to authenticated using (public.has_school_permission(school_id, 'extracurricular.read'));
create policy extracurricular_attendance_manage on public.extracurricular_attendance for all to authenticated using (public.has_school_permission(school_id, 'extracurricular.attendance')) with check (public.has_school_permission(school_id, 'extracurricular.attendance'));
create policy extracurricular_events_read on public.extracurricular_events for select to authenticated using (public.has_school_permission(school_id, 'extracurricular.read'));

grant select, insert, update, delete on public.extracurriculars, public.extracurricular_sessions, public.extracurricular_members to authenticated;
grant select, insert, update on public.extracurricular_attendance to authenticated;
grant select on public.extracurricular_events to authenticated;

commit;
