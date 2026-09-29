begin;

-- 1. Add portal_session_id to parent_student_links to isolate shared QR users
alter table public.parent_student_links add column portal_session_id uuid;

-- 2. Drop the old unique constraint and create a new one
alter table public.parent_student_links drop constraint parent_student_links_identity_key;
create unique index parent_student_links_identity_idx on public.parent_student_links 
  (school_id, parent_user_id, student_id, coalesce(portal_session_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 3. Replace the link_student_to_parent_portal function
create or replace function public.link_student_to_parent_portal(p_nisn text, p_dob date, p_parent_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  q public.qr_access_tokens;
  s public.students;
  v_session_id uuid;
begin
  if not public.portal_session_active() then raise exception 'Akses portal dinonaktifkan' using errcode='42501'; end if;
  select * into q from public.qr_access_tokens where auth_user_id = auth.uid();
  if not found or q.role_code <> 'PARENT' then raise exception 'Bukan sesi portal orang tua' using errcode='42501'; end if;

  select * into s from public.students 
  where school_id = q.school_id 
    and (nisn = p_nisn or student_number = p_nisn)
    and date_of_birth = p_dob
    and is_active = true 
    and deleted_at is null;

  if not found then raise exception 'Data anak tidak ditemukan dengan NISN/Nomor Siswa dan tanggal lahir tersebut' using errcode='22023'; end if;

  if p_parent_name is not null and trim(p_parent_name) <> '' then
    update public.parent_profiles set full_name = trim(p_parent_name) where user_id = auth.uid();
  end if;

  v_session_id := (auth.jwt() ->> 'session_id')::uuid;

  insert into public.parent_student_links(school_id, parent_user_id, student_id, relationship, status, portal_session_id)
  values (q.school_id, auth.uid(), s.id, 'OTHER', 'ACTIVE', v_session_id)
  on conflict (school_id, parent_user_id, student_id, coalesce(portal_session_id, '00000000-0000-0000-0000-000000000000'::uuid)) 
  do update set status = 'ACTIVE', revoked_at = null;

  return jsonb_build_object('success', true, 'student_id', s.id);
end $$;

-- 4. Replace get_parent_children and get_parent_child_today
create or replace function public.get_parent_children()
returns table (link_id uuid, student_id uuid, school_id uuid, school_name varchar, full_name varchar, student_number varchar, class_name varchar, relationship public.parent_relationship)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select l.id, s.id, l.school_id, sc.name, s.full_name, s.student_number, c.name, l.relationship
  from public.parent_student_links l
  join public.students s on s.school_id = l.school_id and s.id = l.student_id
  join public.schools sc on sc.id = l.school_id
  left join public.student_class_history h on h.school_id = s.school_id and h.student_id = s.id and h.is_current
  left join public.classes c on c.school_id = h.school_id and c.id = h.class_id
  where public.portal_session_active() 
    and l.parent_user_id = auth.uid() 
    and l.portal_session_id = (auth.jwt()->>'session_id')::uuid 
    and l.status = 'ACTIVE'
    and s.is_active and s.deleted_at is null;
$$;

create or replace function public.get_parent_child_today(target_student_id uuid)
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
    and portal_session_id = (auth.jwt()->>'session_id')::uuid 
    and student_id = target_student_id 
    and status = 'ACTIVE';
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

notify pgrst, 'reload schema';
commit;
