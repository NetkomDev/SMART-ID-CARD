begin;

create or replace function public.get_parent_child_today(target_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare 
  link_row public.parent_student_links; 
  tz text; 
  all_events jsonb;
begin
  select * into link_row from public.parent_student_links
  where parent_user_id = auth.uid() and student_id = target_student_id and status = 'ACTIVE';
  if not found then raise exception 'child relationship not found' using errcode = 'AP002'; end if;
  
  select timezone into tz from public.schools where id = link_row.school_id;
  
  with today_attendance as (
    select id, case direction when 'CHECK_IN' then 'attendance.check_in' else 'attendance.check_out' end as type,
    occurred_at_local as occurred_at, is_late, null::text as extra_info
    from public.attendance_logs
    where school_id = link_row.school_id and student_id = target_student_id
      and (occurred_at_local at time zone tz)::date = (now() at time zone tz)::date
  ),
  today_waste as (
    select id, 'waste.transaction' as type,
    created_at as occurred_at, false as is_late, ('Setoran ' || total_kg::text || ' kg') as extra_info
    from public.waste_transactions
    where school_id = link_row.school_id and student_id = target_student_id
      and (created_at at time zone tz)::date = (now() at time zone tz)::date
  ),
  today_library as (
    select id, 'library.visit' as type,
    visited_at as occurred_at, false as is_late, 'Kunjungan Perpustakaan' as extra_info
    from public.library_visits
    where school_id = link_row.school_id and student_id = target_student_id
      and (visited_at at time zone tz)::date = (now() at time zone tz)::date
  ),
  today_ekskul as (
    select a.id, 'extracurricular.attendance' as type,
    a.created_at as occurred_at, false as is_late, ('Kehadiran Ekskul ' || e.name) as extra_info
    from public.extracurricular_attendance a
    join public.extracurriculars e on e.id = a.extracurricular_id
    where a.school_id = link_row.school_id and a.student_id = target_student_id
      and (a.created_at at time zone tz)::date = (now() at time zone tz)::date
  ),
  combined_events as (
    select * from today_attendance
    union all select * from today_waste
    union all select * from today_library
    union all select * from today_ekskul
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'type', type, 'occurred_at', occurred_at, 'is_late', is_late, 'extra_info', extra_info
  ) order by occurred_at desc), '[]'::jsonb) into all_events
  from combined_events;
  
  return jsonb_build_object('student_id', target_student_id, 'timezone', tz, 'events', all_events);
end;
$$;

commit;
