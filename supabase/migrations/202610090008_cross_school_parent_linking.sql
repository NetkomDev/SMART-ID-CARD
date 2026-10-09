begin;

-- Modify link_student_to_parent_portal to support CROSS-SCHOOL linking
-- By removing the strict school_id filter, parents can link their children 
-- from other schools using the same Parent Portal session (QR Code).
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
  
  -- FIND ACROSS ALL SCHOOLS (Cross-School support)
  select * into s from public.students 
  where student_number = v_clean_nisn 
    and date_of_birth = p_dob 
    and is_active = true 
    and deleted_at is null
  limit 1; -- Protect against duplicate NISNs across the entire platform, grab the first exact match

  if not found then
    raise exception 'NISN atau Tanggal Lahir tidak cocok dengan data siswa aktif.' using errcode='AG004';
  end if;

  -- Insert link, making sure to use s.school_id (the target student's school), NOT q.school_id
  insert into public.parent_student_links(school_id, parent_user_id, student_id, relationship, status, device_id)
  values (s.school_id, auth.uid(), s.id, 'OTHER', 'ACTIVE', p_device_id)
  on conflict (school_id, parent_user_id, student_id, coalesce(device_id, ''))
  do update set status = 'ACTIVE', revoked_at = null;

  return jsonb_build_object('success', true, 'student_id', s.id, 'school_id', s.school_id);
end $$;

grant execute on function public.link_student_to_parent_portal(text, date, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
