begin;

-- 1. Revert get_parent_children and get_parent_child_today to REQUIRE device_id
-- We must isolate parents because they all share the same school-level auth.uid()
drop function if exists public.get_parent_children(text);
create or replace function public.get_parent_children(p_device_id text)
 returns table(link_id uuid, student_id uuid, school_id uuid, school_name character varying, full_name character varying, student_number character varying, class_name character varying, relationship public.parent_relationship, photo_url text)
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $$
  select l.id, s.id, l.school_id, sc.name, s.full_name, s.student_number, c.name, l.relationship, s.photo_url
  from public.parent_student_links l
  join public.students s on s.school_id = l.school_id and s.id = l.student_id
  join public.schools sc on sc.id = l.school_id
  left join public.student_class_history h on h.school_id = s.school_id and h.student_id = s.id and h.is_current
  left join public.classes c on c.school_id = h.school_id and c.id = h.class_id
  where public.portal_session_active() 
    and l.parent_user_id = auth.uid() 
    and l.device_id = p_device_id
    and l.status = 'ACTIVE'
    and s.is_active and s.deleted_at is null;
$$;

drop function if exists public.get_parent_child_today(uuid, text);
create or replace function public.get_parent_child_today(target_student_id uuid, p_device_id text)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare 
  link_row public.parent_student_links; 
  tz text; 
  all_events jsonb;
begin
  if not public.portal_session_active() then raise exception 'Akses portal dinonaktifkan' using errcode='42501'; end if;
  select * into link_row from public.parent_student_links
  where parent_user_id = auth.uid() 
    and device_id = p_device_id
    and student_id = target_student_id 
    and status = 'ACTIVE'
  limit 1;
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
  
  return jsonb_build_object('student_id', target_student_id, 'timezone', tz, 'events', all_events);
end;
$$;

grant execute on function public.get_parent_children(text) to authenticated;
grant execute on function public.get_parent_child_today(uuid, text) to authenticated;

-- 2. Drop the old unique constraint and create a new one that INCLUDES device_id
-- This allows Mother's phone and Father's phone to both link the same child without overwriting each other.
alter table public.parent_student_links drop constraint if exists parent_student_links_school_id_parent_user_id_student_id_key;
alter table public.parent_student_links drop constraint if exists parent_student_links_school_id_parent_user_id_student__device_key;

-- We make it unique by school_id, parent_user_id, student_id AND device_id
-- We coalesce device_id to handle nulls safely (though it shouldn't be null now)
create unique index if not exists parent_student_links_multi_device_idx 
on public.parent_student_links (school_id, parent_user_id, student_id, coalesce(device_id, ''));

-- 3. Update link_student_to_parent_portal to use the new multi-device constraint safely
drop function if exists public.link_student_to_parent_portal(text, date, text, text);
create or replace function public.link_student_to_parent_portal(p_nisn text, p_dob date, p_parent_name text, p_device_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  q public.qr_access_tokens;
  s public.students;
  v_clean_nisn text;
begin
  if not public.portal_session_active() then
    raise exception 'Sesi portal tidak valid' using errcode='42501';
  end if;

  select * into q from public.qr_access_tokens where auth_user_id = auth.uid();
  if not found then raise exception 'Sesi bukan portal QR' using errcode='42501'; end if;

  v_clean_nisn := trim(p_nisn);
  select * into s from public.students 
  where school_id = q.school_id 
    and student_number = v_clean_nisn 
    and date_of_birth = p_dob 
    and is_active = true 
    and deleted_at is null;

  if not found then
    raise exception 'NISN atau Tanggal Lahir tidak cocok dengan data siswa aktif.' using errcode='AG004';
  end if;

  -- Insert link, if this specific device already linked this student, just reactivate it
  insert into public.parent_student_links(school_id, parent_user_id, student_id, relationship, status, device_id)
  values (q.school_id, auth.uid(), s.id, 'OTHER', 'ACTIVE', p_device_id)
  on conflict (school_id, parent_user_id, student_id, coalesce(device_id, ''))
  do update set status = 'ACTIVE', revoked_at = null;

  return jsonb_build_object('success', true, 'student_id', s.id);
end $$;

grant execute on function public.link_student_to_parent_portal(text, date, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
