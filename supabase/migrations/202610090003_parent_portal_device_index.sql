begin;

-- Drop the old portal_session_id-based index
drop index if exists public.parent_student_links_identity_idx;

-- Create the new device_id-based index
create unique index parent_student_links_identity_idx on public.parent_student_links 
  (school_id, parent_user_id, student_id, coalesce(device_id, ''));

-- Update the RPC to use the new conflict target
drop function if exists public.link_student_to_parent_portal(text, date, text, text);
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

  insert into public.parent_student_links(school_id, parent_user_id, student_id, relationship, status, device_id)
  values (s.school_id, auth.uid(), s.id, 'OTHER', 'ACTIVE', p_device_id)
  on conflict (school_id, parent_user_id, student_id, coalesce(device_id, '')) 
  do update set status = 'ACTIVE', revoked_at = null;

  return jsonb_build_object('success', true, 'student_id', s.id);
end $$;

grant execute on function public.link_student_to_parent_portal(text, date, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
