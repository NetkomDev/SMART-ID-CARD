begin;

alter table public.parent_student_links add column if not exists device_id text;

drop function if exists public.link_student_to_parent_portal(text, date, text);
create or replace function public.link_student_to_parent_portal(p_nisn text, p_dob date, p_parent_name text, p_device_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  q public.qr_access_tokens;
  s public.students;
  v_clean_nisn text;
begin
  if not public.portal_session_active() then 
    raise exception 'Akses portal dinonaktifkan atau telah kedaluwarsa' using errcode='42501'; 
  end if;

  select * into q from public.qr_access_tokens where auth_user_id = auth.uid();
  if not found or q.role_code <> 'PARENT' then 
    raise exception 'Bukan sesi portal orang tua' using errcode='42501'; 
  end if;

  v_clean_nisn := trim(p_nisn);

  select * into s from public.students 
  where (
      nisn = v_clean_nisn 
      or student_number = v_clean_nisn 
      or lower(nisn) = lower(v_clean_nisn) 
      or lower(student_number) = lower(v_clean_nisn)
    )
    and date_of_birth = p_dob
    and is_active = true 
    and deleted_at is null;

  if not found then 
    raise exception 'Data anak tidak ditemukan dengan NISN/Nomor Siswa dan Tanggal Lahir tersebut.' using errcode='22023'; 
  end if;

  if p_parent_name is not null and trim(p_parent_name) <> '' then
    insert into public.parent_profiles (user_id, full_name)
    values (auth.uid(), trim(p_parent_name))
    on conflict (user_id) do update set full_name = excluded.full_name, updated_at = now();
  end if;

  begin
    insert into public.parent_student_links(school_id, parent_user_id, student_id, relationship, status, device_id)
    values (s.school_id, auth.uid(), s.id, 'OTHER', 'ACTIVE', p_device_id)
    on conflict (school_id, parent_user_id, student_id, coalesce(device_id, '')) 
    do update set status = 'ACTIVE', revoked_at = null;
  exception when others then
    insert into public.parent_student_links(school_id, parent_user_id, student_id, relationship, status, device_id)
    values (s.school_id, auth.uid(), s.id, 'OTHER', 'ACTIVE', p_device_id)
    on conflict (school_id, parent_user_id, student_id) 
    do update set status = 'ACTIVE', revoked_at = null, device_id = excluded.device_id;
  end;

  return jsonb_build_object('success', true, 'student_id', s.id);
end $$;

drop function if exists public.get_parent_children();
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

grant execute on function public.link_student_to_parent_portal(text, date, text, text) to authenticated;
grant execute on function public.get_parent_children(text) to authenticated;

notify pgrst, 'reload schema';

commit;
