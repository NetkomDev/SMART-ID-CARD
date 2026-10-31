begin;

-- Migration: 202610310005_gate_attendance_pwa_offline_sync.sql
-- Supports mobile multi-scanner gate attendance for picket teachers and security staff.
-- Features:
-- 1. Alters attendance_logs to allow device_id and card_id to be nullable (for mobile PWA scanners).
-- 2. Adds notes, is_early_departure, scanner_name to attendance_logs.
-- 3. Adds GATE_STAFF portal role support in provision_portal_access.
-- 4. Introduces ingest_pwa_attendance_scan and sync_pwa_attendance_batch with earliest-timestamp resolution.
-- 5. Adds functions get_or_create_school_attendance_rules and update_school_attendance_rules.
-- 6. Updates get_verified_parent_child_today to return notes, is_early_departure, and detailed attendance status.

-- 1. Schema Alterations
alter table public.attendance_logs alter column device_id drop not null;
alter table public.attendance_logs alter column card_id drop not null;
alter table public.attendance_logs add column if not exists notes text;
alter table public.attendance_logs add column if not exists is_early_departure boolean not null default false;
alter table public.attendance_logs add column if not exists scanner_name text;

-- 2. Update provision_portal_access to support GATE_STAFF
create or replace function public.provision_portal_access(
  p_actor_id uuid,
  p_school_id uuid,
  p_user_id uuid,
  p_token_hash text,
  p_email text,
  p_role_code text,
  p_metadata jsonb
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  token_id uuid;
  role_id uuid;
  school_name text;
  grants text[];
begin
  if not public.can_manage_portal_access(p_school_id) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;

  if p_role_code not in ('WASTE_STAFF', 'LIBRARY_STAFF', 'TEACHER', 'PARENT', 'GATE_STAFF') then
    raise exception 'Portal tidak valid' using errcode = '22023';
  end if;

  if p_role_code = 'WASTE_STAFF' and not exists (
    select 1 from public.classes
    where school_id = p_school_id
      and id = (p_metadata->>'class_id')::uuid
      and deleted_at is null and is_active
  ) then
    raise exception 'Kelas tidak valid' using errcode = '22023';
  end if;

  grants := case p_role_code
    when 'WASTE_STAFF' then array['waste.read', 'waste.transact']
    when 'LIBRARY_STAFF' then array['library.read', 'library.manage']
    when 'TEACHER' then array['extracurricular.read', 'extracurricular.manage']
    when 'GATE_STAFF' then array['attendance.read', 'attendance.manage', 'card.read', 'student.read', 'device.read']
    when 'PARENT' then array['parent.read', 'parent.manage']
  end;

  insert into public.roles(school_id, code, name, is_system)
  values(p_school_id, 'PORTAL_' || p_role_code, 'Portal ' || p_role_code, true)
  on conflict (school_id, code) do update set updated_at = now()
  returning id into role_id;

  delete from public.role_permissions where role_id = role_id;
  insert into public.role_permissions(role_id, permission_code)
  select role_id, unnest(grants)
  on conflict do nothing;

  insert into public.users(id, full_name, is_active)
  values(p_user_id, 'Portal ' || p_role_code, true)
  on conflict (id) do nothing;

  insert into public.school_users(school_id, user_id, role_id)
  values(p_school_id, p_user_id, role_id)
  on conflict (school_id, user_id) do update set role_id = excluded.role_id, status = 'ACTIVE', deleted_at = null;

  insert into public.qr_access_tokens(school_id, token_hash, auth_user_id, shadow_email, role_code, metadata, created_by)
  values(p_school_id, p_token_hash, p_user_id, p_email, p_role_code, p_metadata, p_actor_id)
  returning id into token_id;

  select name into school_name from public.schools where id = p_school_id;
  perform public.family_audit(p_school_id, 'portal.provisioned', token_id);

  return token_id;
end $$;

-- 3. Attendance Rules Management
create or replace function public.get_or_create_school_attendance_rules(p_school_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  r record;
begin
  select * into r from public.attendance_rules
  where school_id = p_school_id and device_id is null and is_active and deleted_at is null
  limit 1;

  if not found then
    insert into public.attendance_rules(
      school_id, name, mode, entry_start, on_time_until, checkout_start, duplicate_window_seconds, is_active
    ) values (
      p_school_id, 'Aturan Jam Kehadiran Sekolah', 'AUTO',
      '06:00:00'::time, '07:15:00'::time, '14:30:00'::time, 30, true
    ) returning * into r;
  end if;

  return jsonb_build_object(
    'id', r.id,
    'school_id', r.school_id,
    'entry_start', to_char(r.entry_start, 'HH24:MI'),
    'on_time_until', to_char(r.on_time_until, 'HH24:MI'),
    'checkout_start', to_char(r.checkout_start, 'HH24:MI'),
    'mode', r.mode
  );
end $$;

create or replace function public.update_school_attendance_rules(
  p_school_id uuid,
  p_entry_start time,
  p_on_time_until time,
  p_checkout_start time
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  r record;
begin
  if not public.has_school_permission(p_school_id, 'attendance.manage') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;

  select * into r from public.attendance_rules
  where school_id = p_school_id and device_id is null and is_active and deleted_at is null
  limit 1;

  if not found then
    insert into public.attendance_rules(
      school_id, name, mode, entry_start, on_time_until, checkout_start, duplicate_window_seconds, is_active
    ) values (
      p_school_id, 'Aturan Jam Kehadiran Sekolah', 'AUTO',
      p_entry_start, p_on_time_until, p_checkout_start, 30, true
    ) returning * into r;
  else
    update public.attendance_rules
    set entry_start = p_entry_start,
        on_time_until = p_on_time_until,
        checkout_start = p_checkout_start,
        updated_at = now()
    where id = r.id
    returning * into r;
  end if;

  perform public.family_audit(p_school_id, 'attendance.rules.updated', r.id);

  return jsonb_build_object(
    'id', r.id,
    'school_id', r.school_id,
    'entry_start', to_char(r.entry_start, 'HH24:MI'),
    'on_time_until', to_char(r.on_time_until, 'HH24:MI'),
    'checkout_start', to_char(r.checkout_start, 'HH24:MI'),
    'mode', r.mode
  );
end $$;

-- 4. PWA Ingestion RPC (Single Scan with Earliest Timestamp Resolution)
create or replace function public.ingest_pwa_attendance_scan(
  p_token_hash text,
  p_event_id uuid,
  p_identifier text, -- can be student_id (uuid), student_number, nisn, or card qr_key/card_uid
  p_direction public.attendance_direction,
  p_occurred_at timestamptz,
  p_notes text default null,
  p_scanner_name text default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare
  q public.qr_access_tokens;
  tz text;
  stud record;
  card_row public.student_cards;
  rule record;
  local_time time;
  local_day date;
  class_id_val uuid;
  existing_log public.attendance_logs;
  calculated_is_late boolean := false;
  calculated_is_early boolean := false;
  clean_id text;
begin
  -- Validate Portal Session
  select * into q from public.qr_access_tokens
  where token_hash = p_token_hash and revoked_at is null
    and (expires_at is null or expires_at > now())
    and role_code in ('GATE_STAFF', 'TEACHER')
  limit 1;

  if not found then
    raise exception 'Sesi portal presensi tidak valid atau telah dicabut.' using errcode = '42501';
  end if;

  select timezone into tz from public.schools where id = q.school_id;
  if tz is null then tz := 'Asia/Makassar'; end if;

  clean_id := btrim(p_identifier);

  -- Resolve Student
  select s.id, s.school_id, s.full_name, s.student_number, s.nisn, s.photo_url
  into stud
  from public.students s
  where s.school_id = q.school_id and s.is_active and s.deleted_at is null
    and (
      s.id::text = clean_id
      or s.nisn = clean_id
      or s.student_number = clean_id
      or exists (
        select 1 from public.student_cards sc
        where sc.student_id = s.id and sc.school_id = q.school_id and sc.status = 'ACTIVE'
          and (sc.qr_key = clean_id or upper(sc.card_uid) = upper(clean_id))
      )
    )
  order by s.created_at desc
  limit 1;

  if stud.id is null then
    return jsonb_build_object(
      'success', false,
      'code', 'STUDENT_NOT_FOUND',
      'message', 'Kartu atau identitas siswa tidak ditemukan di sekolah ini.'
    );
  end if;

  -- Get current class
  select class_id into class_id_val from public.student_class_history
  where school_id = q.school_id and student_id = stud.id and is_current
  limit 1;

  -- Get active card if available
  select * into card_row from public.student_cards
  where school_id = q.school_id and student_id = stud.id and status = 'ACTIVE'
  order by created_at desc limit 1;

  -- Load attendance rules
  select * into rule from public.attendance_rules
  where school_id = q.school_id and is_active and deleted_at is null
  order by (device_id is null) desc limit 1;

  local_time := (p_occurred_at at time zone tz)::time;
  local_day := (p_occurred_at at time zone tz)::date;

  if rule.id is not null then
    if p_direction = 'CHECK_IN' then
      calculated_is_late := rule.on_time_until is not null and local_time > rule.on_time_until;
    elsif p_direction = 'CHECK_OUT' then
      calculated_is_early := rule.checkout_start is not null and local_time < rule.checkout_start;
    end if;
  end if;

  -- Advisory lock to prevent race conditions on simultaneous scans for the same student on the same day & direction
  perform pg_advisory_xact_lock(hashtextextended(
    q.school_id::text || ':' || stud.id::text || ':' || local_day::text || ':' || p_direction::text, 0
  ));

  -- Check if already scanned today for this direction
  select * into existing_log from public.attendance_logs
  where school_id = q.school_id and student_id = stud.id and direction = p_direction
    and (occurred_at_local at time zone tz)::date = local_day
  order by occurred_at_local asc
  limit 1;

  if existing_log.id is null then
    -- Brand new scan
    insert into public.attendance_logs (
      event_id, school_id, student_id, card_id, class_id, direction,
      source, occurred_at_local, local_sequence, is_late, is_early_departure,
      notes, scanner_name, metadata
    ) values (
      p_event_id, q.school_id, stud.id, card_row.id, class_id_val, p_direction,
      'REALTIME', p_occurred_at, 1, calculated_is_late, calculated_is_early,
      btrim(p_notes), p_scanner_name,
      jsonb_build_object('scanner_role', q.role_code, 'synced_at', now())
    );

    return jsonb_build_object(
      'success', true,
      'status', 'ACCEPTED',
      'action', 'INSERTED',
      'student_id', stud.id,
      'student_name', stud.full_name,
      'direction', p_direction,
      'occurred_at', to_char(p_occurred_at at time zone tz, 'HH24.MI'),
      'is_late', calculated_is_late,
      'is_early_departure', calculated_is_early,
      'notes', p_notes,
      'message', case when p_direction = 'CHECK_IN' then 'Presensi masuk berhasil dicatat.' else 'Presensi pulang berhasil dicatat.' end
    );
  else
    -- Duplicate check: EARLIEST TIMESTAMP WINS
    if p_occurred_at < existing_log.occurred_at_local then
      -- New scan was actually recorded EARLIER (e.g. Teacher A scanned at 07.30 offline, Teacher B scanned at 07.35)
      update public.attendance_logs
      set occurred_at_local = p_occurred_at,
          is_late = calculated_is_late,
          is_early_departure = calculated_is_early,
          notes = coalesce(btrim(p_notes), notes),
          scanner_name = coalesce(p_scanner_name, scanner_name),
          metadata = metadata || jsonb_build_object('superseded_scan_from', existing_log.occurred_at_local, 'resolved_at', now())
      where id = existing_log.id;

      return jsonb_build_object(
        'success', true,
        'status', 'UPDATED_EARLIER',
        'action', 'UPDATED',
        'student_id', stud.id,
        'student_name', stud.full_name,
        'direction', p_direction,
        'occurred_at', to_char(p_occurred_at at time zone tz, 'HH24.MI'),
        'is_late', calculated_is_late,
        'is_early_departure', calculated_is_early,
        'notes', p_notes,
        'message', 'Presensi disahkan dengan jam scan paling awal (' || to_char(p_occurred_at at time zone tz, 'HH24.MI') || ').'
      );
    else
      -- Incoming scan happened AFTER the existing one. Keep the earlier record as official.
      return jsonb_build_object(
        'success', true,
        'status', 'DUPLICATE_IGNORED',
        'action', 'IGNORED',
        'student_id', stud.id,
        'student_name', stud.full_name,
        'direction', p_direction,
        'occurred_at', to_char(existing_log.occurred_at_local at time zone tz, 'HH24.MI'),
        'is_late', existing_log.is_late,
        'is_early_departure', existing_log.is_early_departure,
        'notes', existing_log.notes,
        'message', 'Siswa sudah tercatat ' || (case when p_direction = 'CHECK_IN' then 'masuk' else 'pulang' end) || ' hari ini pada ' || to_char(existing_log.occurred_at_local at time zone tz, 'HH24.MI') || '.'
      );
    end if;
  end if;
end $$;

-- 5. Batch Ingestion RPC for offline sync
create or replace function public.sync_pwa_attendance_batch(
  p_token_hash text,
  p_scans jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare
  item jsonb;
  item_result jsonb;
  results jsonb := '[]'::jsonb;
begin
  for item in select * from jsonb_array_elements(p_scans)
  loop
    begin
      item_result := public.ingest_pwa_attendance_scan(
        p_token_hash,
        (item->>'event_id')::uuid,
        item->>'identifier',
        (item->>'direction')::public.attendance_direction,
        (item->>'occurred_at')::timestamptz,
        item->>'notes',
        item->>'scanner_name'
      );
    exception when others then
      item_result := jsonb_build_object(
        'success', false,
        'event_id', item->>'event_id',
        'code', SQLSTATE,
        'message', SQLERRM
      );
    end;
    results := results || jsonb_build_array(item_result || jsonb_build_object('event_id', item->>'event_id'));
  end loop;

  return jsonb_build_object('total', jsonb_array_length(p_scans), 'results', results);
end $$;

-- 6. Update get_verified_parent_child_today to include notes and is_early_departure
create or replace function public.get_verified_parent_child_today(target_student_id uuid)
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
  permit_reason text;
  day_start timestamptz;
  day_end timestamptz;
begin
  if not public.can_access_parent_child(target_student_id) then raise exception 'Child access denied' using errcode='42501'; end if;
  select * into link_row from public.parent_student_links
  where parent_user_id = auth.uid()
    and verified_at is not null
    and student_id = target_student_id
    and status = 'ACTIVE';
  if not found then raise exception 'child relationship not found' using errcode = 'AP002'; end if;

  select timezone into tz from public.schools where id = link_row.school_id;
  if tz is null then tz := 'Asia/Makassar'; end if;
  day_start := date_trunc('day', now() at time zone tz) at time zone tz;
  day_end := (date_trunc('day', now() at time zone tz) + interval '1 day') at time zone tz;

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

  select reason::text into permit_reason from public.student_absence_permits
  where school_id = link_row.school_id and student_id = target_student_id and permit_date = (now() at time zone tz)::date;

  -- 2. Today's Attendance summary
  select
    to_char(min(occurred_at_local) filter (where direction = 'CHECK_IN') at time zone tz, 'HH24.MI') as check_in,
    to_char(max(occurred_at_local) filter (where direction = 'CHECK_OUT') at time zone tz, 'HH24.MI') as check_out,
    bool_or(is_late) filter (where direction = 'CHECK_IN') as is_late,
    bool_or(is_early_departure) filter (where direction = 'CHECK_OUT') as is_early_departure,
    (array_remove(array_agg(notes order by occurred_at_local asc) filter (where direction = 'CHECK_IN' and notes is not null and notes <> ''), null))[1] as check_in_note,
    (array_remove(array_agg(notes order by occurred_at_local desc) filter (where direction = 'CHECK_OUT' and notes is not null and notes <> ''), null))[1] as check_out_note
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
    count(*) filter (where occurred_at >= date_trunc('month', now() at time zone tz) at time zone tz) as month_visits
  into library_record
  from public.library_visits
  where school_id = link_row.school_id and student_id = target_student_id;

  -- 5. Extracurricular summary
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', es.id, 'name', e.name, 'starts_at', es.starts_at, 'ends_at', es.ends_at,
    'schedule', to_char(es.starts_at at time zone tz, 'HH24.MI') || ' – ' || to_char(es.ends_at at time zone tz, 'HH24.MI'),
    'status', case a.status when 'PRESENT' then 'HADIR' when 'EXCUSED' then 'IZIN' when 'ABSENT' then 'ALPA' else 'BELUM_HADIR' end,
    'time_attended', coalesce(to_char(a.marked_at at time zone tz, 'HH24.MI'), '—')
  ) order by es.starts_at asc), '[]'::jsonb) into activities
  from public.extracurricular_members m
  join public.extracurriculars e on e.school_id = m.school_id and e.id = m.extracurricular_id
  join public.extracurricular_sessions es on es.school_id = e.school_id and es.extracurricular_id = e.id
  left join public.extracurricular_attendance a on a.school_id = es.school_id and a.session_id = es.id and a.student_id = m.student_id
  where m.school_id = link_row.school_id and m.student_id = target_student_id and m.status = 'ACTIVE'
    and e.is_active and e.deleted_at is null and es.status <> 'CANCELLED'
    and es.starts_at >= day_start and es.starts_at < day_end;

  -- 6. Events timeline
  with today_attendance as (
    select id, 'attendance.' || lower(direction::text) as type,
    occurred_at_local as occurred_at, is_late,
    case
      when direction = 'CHECK_IN' and is_late then 'Tiba di sekolah (Terlambat' || coalesce(': ' || notes, '') || ')'
      when direction = 'CHECK_IN' then 'Tiba di sekolah'
      when direction = 'CHECK_OUT' and is_early_departure then 'Meninggalkan sekolah (Pulang Cepat' || coalesce(': ' || notes, '') || ')'
      else 'Meninggalkan sekolah' end as extra_info
    from public.attendance_logs
    where school_id = link_row.school_id and student_id = target_student_id
      and occurred_at_local >= day_start and occurred_at_local < day_end
  ),
  today_waste as (
    select id, 'waste.transaction' as type,
    created_at as occurred_at, false as is_late,
    coalesce(total_kg::text, '0') || ' kg sampah' as extra_info
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
    'contract_version', 3,
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
        when permit_reason is not null then permit_reason
        else 'BELUM_HADIR' end,
      'check_in', coalesce(att_record.check_in, '—'),
      'check_out', coalesce(att_record.check_out, '—'),
      'is_late', coalesce(att_record.is_late, false),
      'is_early_departure', coalesce(att_record.is_early_departure, false),
      'check_in_note', att_record.check_in_note,
      'check_out_note', att_record.check_out_note,
      'note', case
        when att_record.check_out is not null and att_record.is_early_departure then
          'Hari ini Pulang Cepat' || coalesce(' (' || att_record.check_out_note || ')', '')
        when att_record.check_in is not null and att_record.is_late then
          'Hari ini Terlambat' || coalesce(' (' || att_record.check_in_note || ')', '')
        else null end
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

revoke all on function public.ingest_pwa_attendance_scan(text, uuid, text, public.attendance_direction, timestamptz, text, text) from public, anon;
grant execute on function public.ingest_pwa_attendance_scan(text, uuid, text, public.attendance_direction, timestamptz, text, text) to authenticated, anon;

revoke all on function public.sync_pwa_attendance_batch(text, jsonb) from public, anon;
grant execute on function public.sync_pwa_attendance_batch(text, jsonb) to authenticated, anon;

revoke all on function public.get_or_create_school_attendance_rules(uuid) from public, anon;
grant execute on function public.get_or_create_school_attendance_rules(uuid) to authenticated, anon;

revoke all on function public.update_school_attendance_rules(uuid, time, time, time) from public, anon;
grant execute on function public.update_school_attendance_rules(uuid, time, time, time) to authenticated;

notify pgrst, 'reload schema';

commit;
