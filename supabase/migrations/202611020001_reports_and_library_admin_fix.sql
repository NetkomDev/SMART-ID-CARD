-- Migration: Ensure reporting RPCs, fallback report period, and school admin access to library loans
begin;

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  created_by uuid not null references public.users(id),
  domain varchar(32) not null,
  format varchar(8) not null,
  filter_payload jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists report_exports_school_created_idx
  on public.report_exports(school_id, created_at desc);

alter table public.report_exports enable row level security;
alter table public.report_exports force row level security;

drop policy if exists report_exports_select on public.report_exports;
create policy report_exports_select on public.report_exports for select to authenticated
using (public.has_school_permission(school_id, 'report.read'));

drop policy if exists report_exports_insert on public.report_exports;
create policy report_exports_insert on public.report_exports for insert to authenticated
with check (public.has_school_permission(school_id, 'report.read') and created_by = auth.uid());

grant select, insert on public.report_exports to authenticated;

create or replace function public.report_period(p_school uuid, p_from timestamptz, p_to timestamptz)
returns table(start_at timestamptz, end_at timestamptz) language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare y public.academic_years;
begin
  if p_from is not null and p_to is not null then
    if p_to <= p_from then raise exception 'Periode tidak valid' using errcode='22023'; end if;
    return query select p_from, p_to; return;
  end if;
  -- Try active academic year
  select * into y from public.academic_years where school_id=p_school and is_active limit 1;
  if not found then
    -- Fallback: most recent academic year
    select * into y from public.academic_years where school_id=p_school order by created_at desc limit 1;
  end if;
  if found and y.start_date is not null and y.end_date is not null then
    return query select (y.start_date::text || 'T00:00:00+08:00')::timestamptz, ((y.end_date + 1)::text || 'T00:00:00+08:00')::timestamptz;
  else
    -- Fallback: current year
    return query select date_trunc('year', now()), date_trunc('year', now()) + interval '1 year';
  end if;
end $$;

create or replace function public.report_classes(p_school uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p record;
begin
  if not public.has_school_permission(p_school, 'report.read') then raise exception 'Akses ditolak' using errcode='42501'; end if;
  select * into p from public.report_period(p_school, p_from, p_to);
  return jsonb_build_object(
    'from', p.start_at,
    'to', p.end_at,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'student_count', (select count(*) from public.student_class_history h join public.students s on s.id=h.student_id and s.school_id=p_school and s.is_active and s.deleted_at is null where h.school_id=p_school and h.class_id=c.id and h.is_current),
        'attendance_count', (select count(*) from public.attendance_logs a where a.school_id=p_school and a.class_id=c.id and a.direction='CHECK_IN' and a.occurred_at>=p.start_at and a.occurred_at<p.end_at),
        'waste_kg', coalesce((select round(coalesce(sum(w.weight_kg),0)::numeric, 2) from public.waste_transactions w where w.school_id=p_school and w.class_id=c.id and w.occurred_at>=p.start_at and w.occurred_at<p.end_at), 0),
        'library_visits', (select count(*) from public.library_visits l where l.school_id=p_school and l.class_id=c.id and l.occurred_at>=p.start_at and l.occurred_at<p.end_at),
        'extracurricular_members', (select count(distinct m.student_id) from public.extracurricular_members m join public.student_class_history h on h.school_id=p_school and h.student_id=m.student_id and h.class_id=c.id and h.is_current where m.school_id=p_school and m.left_at is null)
      ) order by c.name)
      from public.classes c where c.school_id=p_school
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.report_class_students(p_school uuid, p_class uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p record;
begin
  if not public.has_school_permission(p_school, 'report.read') then raise exception 'Akses ditolak' using errcode='42501'; end if;
  select * into p from public.report_period(p_school, p_from, p_to);
  return jsonb_build_object(
    'from', p.start_at,
    'to', p.end_at,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', s.id,
        'full_name', s.full_name,
        'student_number', s.student_number,
        'nisn', coalesce(s.nisn, '-'),
        'attendance_count', (select count(*) from public.attendance_logs a where a.school_id=p_school and a.student_id=s.id and a.direction='CHECK_IN' and a.occurred_at>=p.start_at and a.occurred_at<p.end_at),
        'waste_kg', coalesce((select round(coalesce(sum(w.weight_kg),0)::numeric, 2) from public.waste_transactions w where w.school_id=p_school and w.student_id=s.id and w.occurred_at>=p.start_at and w.occurred_at<p.end_at), 0),
        'library_visits', (select count(*) from public.library_visits l where l.school_id=p_school and l.student_id=s.id and l.occurred_at>=p.start_at and l.occurred_at<p.end_at),
        'extracurricular_details', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id,
            'name', e.name,
            'attended', (select count(*) from public.extracurricular_attendance ea where ea.school_id=p_school and ea.student_id=s.id and ea.extracurricular_id=e.id and ea.occurred_at>=p.start_at and ea.occurred_at<p.end_at),
            'total', (select count(*) from public.extracurricular_sessions es where es.school_id=p_school and es.extracurricular_id=e.id and es.session_date>=p.start_at::date and es.session_date<p.end_at::date)
          ) order by e.name)
          from public.extracurricular_members m
          join public.extracurriculars e on e.id=m.extracurricular_id and e.school_id=p_school
          where m.school_id=p_school and m.student_id=s.id and m.left_at is null
        ), '[]'::jsonb)
      ) order by s.full_name)
      from public.student_class_history h
      join public.students s on s.id=h.student_id and s.school_id=p_school and s.is_active and s.deleted_at is null
      where h.school_id=p_school and h.class_id=p_class and h.is_current
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.report_library_summary(p_school uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p record;
begin
  if not public.has_school_permission(p_school, 'library.read') then raise exception 'Akses ditolak' using errcode='42501'; end if;
  select * into p from public.report_period(p_school, p_from, p_to);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'class_id', l.class_id,
      'class_name', coalesce(c.name, 'Tanpa kelas'),
      'total', count(*)
    ) order by count(*) desc)
    from public.library_visits l
    left join public.classes c on c.school_id=l.school_id and c.id=l.class_id
    where l.school_id=p_school and l.occurred_at>=p.start_at and l.occurred_at<p.end_at
    group by l.class_id, c.name
  ), '[]'::jsonb);
end $$;

create or replace function public.list_portal_library_loans(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare context jsonb;
begin
  if not public.has_school_permission(p_school, 'library.read') then
    context := public.get_portal_context();
    if (context->>'school_id')::uuid <> p_school or context->>'role_code' <> 'LIBRARY_STAFF' then
      raise exception 'Library access denied' using errcode='42501';
    end if;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.borrowed_at desc) from (
    select l.id, l.event_id, l.student_id, s.full_name as student_name, l.book_title, l.book_author, l.borrowed_at, l.due_date, l.returned_at
    from public.library_loans l
    join public.students s on s.id=l.student_id and s.school_id=l.school_id
    where l.school_id=p_school and l.returned_at is null
    order by l.borrowed_at desc
    limit 200
  ) x), '[]'::jsonb);
end $$;

grant execute on function public.report_period(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_classes(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_class_students(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_library_summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.list_portal_library_loans(uuid) to authenticated;

commit;
