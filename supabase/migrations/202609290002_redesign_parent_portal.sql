begin;

create or replace function public.get_parent_child_today(target_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare 
  link_row public.parent_student_links; 
  tz text; 
  student_rec record;
  att_record record;
  waste_record record;
  library_record record;
  ekskul_record record;
  all_events jsonb;
begin
  if not public.portal_session_active() then raise exception 'Akses portal dinonaktifkan' using errcode='42501'; end if;
  select * into link_row from public.parent_student_links
  where parent_user_id = auth.uid() 
    and portal_session_id = (auth.jwt()->>'session_id')::uuid 
    and student_id = target_student_id 
    and status = 'ACTIVE';
  if not found then raise exception 'child relationship not found' using errcode = 'AP002'; end if;
  
  select timezone into tz from public.schools where id = link_row.school_id;
  if tz is null then tz := 'Asia/Makassar'; end if;

  -- 1. Student details
  select s.id, s.full_name, s.student_number, s.photo_url, sc.name as school_name, coalesce(c.name, 'Belum ada kelas') as class_name
  into student_rec
  from public.students s
  join public.schools sc on sc.id = s.school_id
  left join public.student_class_history h on h.school_id = s.school_id and h.student_id = s.id and h.is_current
  left join public.classes c on c.school_id = h.school_id and c.id = h.class_id
  where s.id = target_student_id;

  -- 2. Today's Attendance summary
  select 
    max(case when direction = 'CHECK_IN' then to_char(occurred_at_local, 'HH24.MI') end) as check_in,
    max(case when direction = 'CHECK_OUT' then to_char(occurred_at_local, 'HH24.MI') end) as check_out,
    bool_or(is_late) filter (where direction = 'CHECK_IN') as is_late
  into att_record
  from public.attendance_logs
  where school_id = link_row.school_id and student_id = target_student_id
    and (occurred_at_local at time zone tz)::date = (now() at time zone tz)::date;

  -- 3. Waste summary
  select 
    coalesce(sum(total_kg) filter (where (created_at at time zone tz)::date = (now() at time zone tz)::date), 0) as today_kg,
    coalesce(sum(points_earned), 0) as total_points,
    coalesce(sum(points_earned) filter (where (created_at at time zone tz)::date = (now() at time zone tz)::date), 0) as today_points
  into waste_record
  from public.waste_transactions
  where school_id = link_row.school_id and student_id = target_student_id;

  -- 4. Library summary
  select 
    count(*) filter (where (occurred_at at time zone tz)::date = (now() at time zone tz)::date) as today_visits,
    count(*) filter (where date_trunc('month', occurred_at at time zone tz) = date_trunc('month', now() at time zone tz)) as month_visits
  into library_record
  from public.library_visits
  where school_id = link_row.school_id and student_id = target_student_id;

  -- 5. Extracurricular summary
  select 
    coalesce(e.name, 'Belum Ada') as name,
    case when a.id is not null then 'HADIR' else 'BELUM_HADIR' end as status,
    to_char(a.created_at at time zone tz, 'HH24.MI') as time_attended
  into ekskul_record
  from public.extracurricular_attendance a
  join public.extracurriculars e on e.id = a.extracurricular_id
  where a.school_id = link_row.school_id and a.student_id = target_student_id
    and (a.created_at at time zone tz)::date = (now() at time zone tz)::date
  order by a.created_at desc limit 1;

  if ekskul_record.name is null then
    select e.name into ekskul_record.name
    from public.extracurricular_members m
    join public.extracurriculars e on e.id = m.extracurricular_id
    where m.school_id = link_row.school_id and m.student_id = target_student_id
    limit 1;
  end if;

  -- 6. Events timeline
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
    occurred_at as occurred_at, false as is_late, 'Kunjungan Perpustakaan' as extra_info
    from public.library_visits
    where school_id = link_row.school_id and student_id = target_student_id
      and (occurred_at at time zone tz)::date = (now() at time zone tz)::date
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

  return jsonb_build_object(
    'student_id', target_student_id,
    'timezone', tz,
    'profile', jsonb_build_object(
      'full_name', coalesce(student_rec.full_name, 'Siswa'),
      'first_name', split_part(coalesce(student_rec.full_name, 'Siswa'), ' ', 1),
      'school_name', coalesce(student_rec.school_name, 'Sekolah'),
      'class_name', coalesce(student_rec.class_name, 'Belum ada kelas'),
      'photo_url', student_rec.photo_url
    ),
    'attendance', jsonb_build_object(
      'status', case 
        when att_record.check_out is not null then 'PULANG'
        when att_record.check_in is not null and att_record.is_late then 'TERLAMBAT'
        when att_record.check_in is not null then 'HADIR'
        else 'BELUM_HADIR' end,
      'check_in', coalesce(att_record.check_in, '—'),
      'check_out', coalesce(att_record.check_out, '—')
    ),
    'waste', jsonb_build_object(
      'today_kg', coalesce(waste_record.today_kg, 0),
      'total_points', coalesce(waste_record.total_points, 0),
      'today_points', coalesce(waste_record.today_points, 0)
    ),
    'library', jsonb_build_object(
      'today_visits', coalesce(library_record.today_visits, 0),
      'month_visits', coalesce(library_record.month_visits, 0)
    ),
    'extracurricular', jsonb_build_object(
      'name', coalesce(ekskul_record.name, 'Belum ada'),
      'status', coalesce(ekskul_record.status, 'BELUM_HADIR'),
      'time_attended', coalesce(ekskul_record.time_attended, '—')
    ),
    'events', all_events
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
