begin;

-- Migration: 202610310004_parent_self_service_link_by_nisn_dob.sql
-- Streamline parent linking: replaces manual token codes from school admins with direct NISN + DOB self-service linking.

create or replace function public.link_child_by_nisn_dob(p_nisn text, p_dob date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions as $$
declare
  stud record;
  link_id uuid;
  a record;
  clean_nisn text;
  guardian_phone text;
begin
  -- 1. Ensure caller is an authenticated individual parent
  if not public.is_individual_parent() then
    raise exception 'Individual verified account required' using errcode = '42501';
  end if;

  -- 2. Brute-force rate-limiting (max 5 failures per 15 minutes window)
  insert into public.parent_claim_attempts(user_id, window_start, failures)
  values(auth.uid(), clock_timestamp(), 0)
  on conflict (user_id) do nothing;

  select * into a from public.parent_claim_attempts where user_id = auth.uid() for update;
  if a.window_start < clock_timestamp() - interval '15 minutes' then
    update public.parent_claim_attempts set window_start = clock_timestamp(), failures = 0 where user_id = auth.uid();
    a.failures := 0;
  end if;

  if a.failures >= 5 then
    return jsonb_build_object(
      'accepted', false,
      'code', 'RATE_LIMITED',
      'message', 'Batas percobaan tercapai. Silakan coba kembali dalam 15 menit.'
    );
  end if;

  clean_nisn := btrim(p_nisn);
  if length(clean_nisn) < 4 then
    update public.parent_claim_attempts set failures = failures + 1 where user_id = auth.uid();
    return jsonb_build_object(
      'accepted', false,
      'code', 'VALIDATION_ERROR',
      'message', 'NISN tidak valid.'
    );
  end if;

  -- 3. Match student across AKSIS schools
  select s.id, s.school_id, s.full_name, sc.name as school_name into stud
  from public.students s
  join public.schools sc on sc.id = s.school_id
  where (s.nisn = clean_nisn or s.student_number = clean_nisn)
    and s.date_of_birth = p_dob
    and s.is_active = true
    and s.deleted_at is null
    and sc.is_active = true
    and sc.status = 'ACTIVE'
    and sc.deleted_at is null
  order by s.created_at desc
  limit 1;

  if stud.id is null then
    update public.parent_claim_attempts set failures = failures + 1 where user_id = auth.uid();
    return jsonb_build_object(
      'accepted', false,
      'code', 'STUDENT_NOT_FOUND',
      'message', 'Data siswa dengan NISN dan tanggal lahir tersebut tidak ditemukan.'
    );
  end if;

  -- 4. Check if already linked
  select id into link_id
  from public.parent_student_links
  where school_id = stud.school_id
    and parent_user_id = auth.uid()
    and student_id = stud.id
    and status = 'ACTIVE'
    and verified_at is not null;

  if link_id is not null then
    return jsonb_build_object(
      'accepted', true,
      'already_linked', true,
      'link_id', link_id,
      'student_id', stud.id,
      'full_name', stud.full_name,
      'school_name', stud.school_name,
      'message', 'Siswa sudah terhubung dengan akun Anda.'
    );
  end if;

  -- 5. Insert or update parent_student_links
  insert into public.parent_student_links(
    school_id, parent_user_id, student_id, relationship, status, verified_at, verification_source
  )
  values(
    stud.school_id, auth.uid(), stud.id, 'GUARDIAN', 'ACTIVE', now(), 'SELF_SERVICE_NISN_DOB'
  )
  on conflict (school_id, parent_user_id, student_id) where verified_at is not null
  do update set
    status = 'ACTIVE',
    revoked_at = null,
    verified_at = now(),
    verification_source = 'SELF_SERVICE_NISN_DOB'
  returning id into link_id;

  -- 6. Ensure guardian phone exists in parent_portal_identities for cross-school support
  select coalesce(p.phone, u.phone) into guardian_phone
  from public.parent_profiles p
  left join public.users u on u.id = p.user_id
  where p.user_id = auth.uid();

  if guardian_phone is null or guardian_phone = '' then
    select phone into guardian_phone
    from public.parent_portal_identities
    where user_id = auth.uid()
    order by created_at asc
    limit 1;
  end if;

  if guardian_phone is not null and guardian_phone != '' then
    insert into public.parent_portal_identities(school_id, user_id, phone)
    values(stud.school_id, auth.uid(), guardian_phone)
    on conflict (school_id, user_id) do nothing;
  end if;

  -- 7. Audit log & reset failures
  perform public.family_audit(stud.school_id, 'parent.child.linked_by_nisn_dob', stud.id);
  update public.parent_claim_attempts set failures = 0 where user_id = auth.uid();

  return jsonb_build_object(
    'accepted', true,
    'already_linked', false,
    'link_id', link_id,
    'student_id', stud.id,
    'full_name', stud.full_name,
    'school_name', stud.school_name,
    'message', 'Anak berhasil dihubungkan ke portal.'
  );
end $$;

revoke all on function public.link_child_by_nisn_dob(text, date) from public, anon;
grant execute on function public.link_child_by_nisn_dob(text, date) to authenticated;

-- Drop obsolete parent_link_tokens and claim_parent_invitation as requested
drop function if exists public.claim_parent_invitation(text);
drop table if exists public.parent_link_tokens cascade;

notify pgrst, 'reload schema';

commit;
