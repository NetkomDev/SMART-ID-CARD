-- Parent dashboard: school-local summaries, real schedules, session-scoped access.
begin;

-- Existing student records have no photo field; preserve all rows and allow an optional portrait.
alter table public.students add column if not exists photo_url text;

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
  all_events jsonb;
  activities jsonb;
  day_start timestamptz;
  day_end timestamptz;
  month_start timestamptz;
  month_end timestamptz;
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
  day_start := date_trunc('day', now() at time zone tz) at time zone tz;
  day_end := (date_trunc('day', now() at time zone tz) + interval '1 day') at time zone tz;
  month_start := date_trunc('month', now() at time zone tz) at time zone tz;
  month_end := (date_trunc('month', now() at time zone tz) + interval '1 month') at time zone tz;

  -- 1. Student details
  select s.id, s.full_name, s.student_number, s.photo_url, sc.name as school_name, coalesce(c.name, 'Belum ada kelas') as class_name
  into student_rec
  from public.students s
  join public.schools sc on sc.id = s.school_id
  left join public.student_class_history h on h.school_id = s.school_id and h.student_id = s.id and h.is_current
  left join public.classes c on c.school_id = h.school_id and c.id = h.class_id
  where s.id = target_student_id and s.school_id = link_row.school_id
    and s.is_active and s.deleted_at is null;
  if not found then raise exception 'child relationship not found' using errcode='AP002'; end if;

  -- 2. Today's Attendance summary
  select
    to_char(min(occurred_at_local) filter (where direction = 'CHECK_IN') at time zone tz, 'HH24.MI') as check_in,
    to_char(max(occurred_at_local) filter (where direction = 'CHECK_OUT') at time zone tz, 'HH24.MI') as check_out,
    bool_or(is_late) filter (where direction = 'CHECK_IN') as is_late
  into att_record
  from public.attendance_logs
  where school_id = link_row.school_id and student_id = target_student_id
    and occurred_at_local >= day_start and occurred_at_local < day_end;

  -- 3. Waste summary
  select
    coalesce(sum(total_kg) filter (where created_at >= day_start and created_at < day_end), 0) as today_kg,
    coalesce(sum(points_earned), 0) as total_points,
    coalesce(sum(points_earned) filter (where created_at >= day_start and created_at < day_end), 0) as today_points,
    count(*) filter (where points_earned is null) as unscored
  into waste_record
  from public.waste_transactions
  where school_id = link_row.school_id and student_id = target_student_id;

  -- 4. Library summary
  select
    count(*) filter (where occurred_at >= day_start and occurred_at < day_end) as today_visits,
    count(*) filter (where occurred_at >= month_start and occurred_at < month_end) as month_visits
  into library_record
  from public.library_visits
  where school_id = link_row.school_id and student_id = target_student_id;

  -- Use the session date, never the date an administrator entered attendance.
  -- Include every active membership's non-cancelled session for today.
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', e.name,
    'status', case a.status when 'PRESENT' then 'HADIR' when 'EXCUSED' then 'IZIN'
      when 'ABSENT' then 'ALPA' else 'BELUM_HADIR' end,
    'schedule', to_char(es.starts_at at time zone tz, 'HH24.MI') || ' – ' || to_char(es.ends_at at time zone tz, 'HH24.MI'),
    'time_attended', coalesce(to_char(a.recorded_at at time zone tz, 'HH24.MI'), '—')
  ) order by es.starts_at, es.id), '[]'::jsonb) into activities
  from public.extracurricular_members m
  join public.extracurriculars e on e.school_id=m.school_id and e.id=m.extracurricular_id
  join public.extracurricular_sessions es on es.school_id=e.school_id and es.extracurricular_id=e.id
  left join public.extracurricular_attendance a on a.school_id=es.school_id and a.session_id=es.id and a.student_id=m.student_id
  where m.school_id=link_row.school_id and m.student_id=target_student_id and m.status='ACTIVE'
    and e.is_active and e.deleted_at is null and es.status <> 'CANCELLED'
    and es.starts_at >= day_start and es.starts_at < day_end;

  -- 6. Events timeline
  with today_attendance as (
    select id, case direction when 'CHECK_IN' then 'attendance.check_in' else 'attendance.check_out' end as type,
    occurred_at_local as occurred_at, is_late, null::text as extra_info
    from public.attendance_logs
    where school_id = link_row.school_id and student_id = target_student_id
      and occurred_at_local >= day_start and occurred_at_local < day_end
  ),
  today_waste as (
    select id, 'waste.transaction' as type,
    created_at as occurred_at, false as is_late, ('Setoran ' || total_kg::text || ' kg') as extra_info
    from public.waste_transactions
    where school_id = link_row.school_id and student_id = target_student_id
      and created_at >= day_start and created_at < day_end
  ),
  today_library as (
    select id, 'library.visit' as type,
    occurred_at as occurred_at, false as is_late, 'Kunjungan Perpustakaan' as extra_info
    from public.library_visits
    where school_id = link_row.school_id and student_id = target_student_id
      and occurred_at >= day_start and occurred_at < day_end
  ),
  today_ekskul as (
    select es.id, 'extracurricular.attendance' as type,
    es.starts_at as occurred_at, false as is_late,
    e.name || ' · ' || case a.status when 'PRESENT' then 'Hadir' when 'EXCUSED' then 'Izin'
      when 'ABSENT' then 'Tidak hadir' else 'Belum presensi' end || ' · ' ||
      to_char(es.starts_at at time zone tz, 'HH24.MI') || ' – ' || to_char(es.ends_at at time zone tz, 'HH24.MI') as extra_info
    from public.extracurricular_members m
    join public.extracurriculars e on e.school_id=m.school_id and e.id=m.extracurricular_id
    join public.extracurricular_sessions es on es.school_id=e.school_id and es.extracurricular_id=e.id
    left join public.extracurricular_attendance a on a.school_id=es.school_id and a.session_id=es.id and a.student_id=m.student_id
    where m.school_id=link_row.school_id and m.student_id=target_student_id and m.status='ACTIVE'
      and e.is_active and e.deleted_at is null and es.status <> 'CANCELLED'
      and es.starts_at >= day_start and es.starts_at < day_end
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
    'as_of', now(),
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
      'today_points', coalesce(waste_record.today_points, 0),
      'unscored', waste_record.unscored
    ),
    'library', jsonb_build_object(
      'today_visits', coalesce(library_record.today_visits, 0),
      'month_visits', coalesce(library_record.month_visits, 0)
    ),
    'extracurricular', coalesce(activities->0, jsonb_build_object(
      'name', 'Tidak ada kegiatan hari ini', 'status', 'TIDAK_ADA', 'time_attended', '—', 'schedule', null
    )) || jsonb_build_object('activities_count', jsonb_array_length(activities)),
    'extracurriculars', activities,
    'events', all_events
  );
end;
$$;

revoke all on function public.get_parent_child_today(uuid) from public, anon;
grant execute on function public.get_parent_child_today(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
