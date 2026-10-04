-- Student Absence Permits & Integrated Sick/Permit Tracking
begin;

-- 1. Create permit_reason enum if not exists
do $$ begin
  create type public.permit_reason as enum ('SAKIT', 'IZIN', 'ALASAN_LAIN');
exception
  when duplicate_object then null;
end $$;

-- 2. Create student_absence_permits table
create table if not exists public.student_absence_permits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  parent_user_id uuid not null references auth.users(id) on delete restrict,
  permit_date date not null,
  reason public.permit_reason not null,
  notes text not null default '',
  attachment_url text,
  consecutive_sick_days integer not null default 1,
  status varchar(20) not null default 'APPROVED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_absence_permits_unique_day unique (school_id, student_id, permit_date)
);

create index if not exists student_absence_permits_school_date_idx 
  on public.student_absence_permits (school_id, permit_date);

create index if not exists student_absence_permits_student_date_idx 
  on public.student_absence_permits (student_id, permit_date desc);

alter table public.student_absence_permits enable row level security;

-- Policies for student_absence_permits
create policy student_absence_permits_parent_all on public.student_absence_permits
  for all to authenticated
  using (parent_user_id = auth.uid())
  with check (parent_user_id = auth.uid());

create policy student_absence_permits_school_read on public.student_absence_permits
  for select to authenticated
  using (public.has_school_permission(school_id, 'attendance.read'));

grant select, insert, update, delete on public.student_absence_permits to authenticated;

-- 3. RPC to Submit Student Absence Permit with consecutive sick day check
create or replace function public.submit_student_absence_permit(
  p_student_id uuid,
  p_permit_date date,
  p_reason text,
  p_notes text,
  p_attachment_url text default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_link public.parent_student_links;
  v_school_id uuid;
  v_reason public.permit_reason;
  v_prev_permit public.student_absence_permits;
  v_consecutive integer := 1;
  v_clean_notes text;
  v_clean_url text;
  v_permit public.student_absence_permits;
begin
  if not public.portal_session_active() then
    raise exception 'Akses portal dinonaktifkan atau telah kedaluwarsa' using errcode='42501';
  end if;

  select * into v_link
  from public.parent_student_links
  where parent_user_id = auth.uid()
    and student_id = p_student_id
    and status = 'ACTIVE'
  limit 1;

  if not found then
    raise exception 'Akses tidak diizinkan untuk siswa ini' using errcode='42501';
  end if;

  v_school_id := v_link.school_id;
  
  begin
    v_reason := p_reason::public.permit_reason;
  exception when others then
    raise exception 'Alasan izin tidak valid (pilihan: SAKIT, IZIN, ALASAN_LAIN)' using errcode='22023';
  end;

  v_clean_notes := trim(coalesce(p_notes, ''));
  v_clean_url := nullif(trim(coalesce(p_attachment_url, '')), '');

  -- Calculate consecutive sick days if reason is SAKIT
  if v_reason = 'SAKIT' then
    select * into v_prev_permit
    from public.student_absence_permits
    where school_id = v_school_id
      and student_id = p_student_id
      and permit_date = (p_permit_date - interval '1 day')::date
      and reason = 'SAKIT';

    if found then
      v_consecutive := v_prev_permit.consecutive_sick_days + 1;
    else
      v_consecutive := 1;
    end if;

    -- Enforce mandatory medical certificate on day 2 or higher of being sick
    if v_consecutive >= 2 and (v_clean_url is null or length(v_clean_url) < 10) then
      raise exception 'Surat keterangan dokter wajib dilampirkan untuk izin sakit hari ke-2 (berturut-turut) atau lebih.' using errcode='22023';
    end if;
  end if;

  insert into public.student_absence_permits (
    school_id, student_id, parent_user_id, permit_date, reason, notes, attachment_url, consecutive_sick_days, status
  ) values (
    v_school_id, p_student_id, auth.uid(), p_permit_date, v_reason, v_clean_notes, v_clean_url, v_consecutive, 'APPROVED'
  )
  on conflict (school_id, student_id, permit_date)
  do update set
    reason = excluded.reason,
    notes = excluded.notes,
    attachment_url = coalesce(excluded.attachment_url, public.student_absence_permits.attachment_url),
    consecutive_sick_days = excluded.consecutive_sick_days,
    updated_at = now()
  returning * into v_permit;

  -- Refresh dashboard metrics for that day
  perform public.refresh_dashboard_today(v_school_id);

  return jsonb_build_object(
    'success', true,
    'permit_id', v_permit.id,
    'student_id', p_student_id,
    'permit_date', p_permit_date,
    'reason', v_reason,
    'consecutive_sick_days', v_consecutive,
    'has_attachment', (v_clean_url is not null)
  );
end $$;

grant execute on function public.submit_student_absence_permit(uuid, date, text, text, text) to authenticated;

-- 4. Update get_parent_child_today to include today's permit in attendance & timeline
create or replace function public.get_parent_child_today(target_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare
  link_row public.parent_student_links;
  tz text;
  student_rec record;
  att_record record;
  permit_record record;
  waste_record record;
  library_record record;
  all_events jsonb;
  activities jsonb;
  day_start timestamptz;
  day_end timestamptz;
  month_start timestamptz;
  month_end timestamptz;
  local_today date;
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
  local_today := (now() at time zone tz)::date;
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

  -- 2b. Check today's permit
  select * into permit_record
  from public.student_absence_permits
  where school_id = link_row.school_id and student_id = target_student_id
    and permit_date = local_today;

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

  -- 5. Extracurricular summary
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
  today_permit as (
    select id, 'attendance.permit' as type,
    created_at as occurred_at, false as is_late,
    case reason when 'SAKIT' then 'Permohonan Izin Sakit: ' || notes
                when 'IZIN' then 'Permohonan Izin: ' || notes
                else 'Izin Alasan Lain: ' || notes end as extra_info
    from public.student_absence_permits
    where school_id = link_row.school_id and student_id = target_student_id
      and permit_date = local_today
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
    union all select * from today_permit
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
        when permit_record.id is not null then permit_record.reason::text
        else 'BELUM_HADIR' end,
      'check_in', coalesce(att_record.check_in, '—'),
      'check_out', coalesce(att_record.check_out, '—'),
      'permit', case when permit_record.id is not null then jsonb_build_object(
        'id', permit_record.id,
        'reason', permit_record.reason,
        'notes', permit_record.notes,
        'consecutive_sick_days', permit_record.consecutive_sick_days,
        'has_attachment', (permit_record.attachment_url is not null)
      ) else null end
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

-- 5. Update refresh_dashboard_today to aggregate sick and permit metrics
create or replace function public.refresh_dashboard_today(target_school_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  tz text;
  local_date date;
  day_start timestamptz;
  day_end timestamptz;
  payload jsonb;
  snapshot public.dashboard_daily_snapshots;
  total_students integer;
  sick_count integer;
  permit_count integer;
begin
  if not public.has_school_permission(target_school_id,'dashboard.read') then raise exception 'dashboard access denied' using errcode='42501'; end if;
  select timezone into tz from public.schools where id=target_school_id and status='ACTIVE' and is_active and deleted_at is null;
  if not found then raise exception 'school not found' using errcode='P0002'; end if;
  
  local_date := (now() at time zone tz)::date;
  day_start := local_date::timestamp at time zone tz;
  day_end := (local_date+1)::timestamp at time zone tz;

  select count(*) into total_students from public.students where school_id = target_school_id and is_active and deleted_at is null;

  select count(distinct student_id) into sick_count
  from public.student_absence_permits
  where school_id = target_school_id and permit_date = local_date and reason = 'SAKIT';

  select count(distinct student_id) into permit_count
  from public.student_absence_permits
  where school_id = target_school_id and permit_date = local_date and reason in ('IZIN', 'ALASAN_LAIN');

  select jsonb_build_object(
    'attendance', jsonb_build_object(
      'total', coalesce(total_students, 500),
      'late', count(*) filter(where is_late),
      'students', count(distinct student_id),
      'sick', coalesce(sick_count, 0),
      'permit', coalesce(permit_count, 0)
    ),
    'waste', jsonb_build_object(
      'transactions', (select count(*) from public.waste_transactions where school_id=target_school_id and created_at>=day_start and created_at<day_end),
      'total_kg', coalesce((select sum(total_kg) from public.waste_transactions where school_id=target_school_id and created_at>=day_start and created_at<day_end), 0)
    ),
    'library', jsonb_build_object(
      'visits', (select count(*) from public.library_visits where school_id=target_school_id and occurred_at>=day_start and occurred_at<day_end),
      'students', (select count(distinct student_id) from public.library_visits where school_id=target_school_id and occurred_at>=day_start and occurred_at<day_end)
    ),
    'extracurricular', jsonb_build_object(
      'recorded', (select count(*) from public.extracurricular_attendance where school_id=target_school_id and recorded_at>=day_start and recorded_at<day_end),
      'present', (select count(*) from public.extracurricular_attendance where school_id=target_school_id and recorded_at>=day_start and recorded_at<day_end and status='PRESENT')
    )
  ) into payload from public.attendance_logs where school_id=target_school_id and occurred_at_local>=day_start and occurred_at_local<day_end;

  insert into public.dashboard_daily_snapshots(school_id,metric_date,metrics,generated_at,stale_after)
  values(target_school_id,local_date,payload,now(),now()+interval '2 minutes')
  on conflict(school_id,metric_date) do update set metrics=excluded.metrics,generated_at=excluded.generated_at,stale_after=excluded.stale_after
  returning * into snapshot;

  return jsonb_build_object('school_id',snapshot.school_id,'date',snapshot.metric_date,'timezone',tz,'metrics',snapshot.metrics,'generated_at',snapshot.generated_at,'stale_after',snapshot.stale_after,'is_stale',false);
end $$;

grant execute on function public.refresh_dashboard_today(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
