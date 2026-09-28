begin;

create or replace function public.portal_student_allowed(target_school_id uuid,target_student_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from public.qr_access_tokens where auth_user_id=auth.uid()) or exists(
  select 1 from public.qr_access_tokens q where q.auth_user_id=auth.uid() and q.school_id=target_school_id and (
   (q.role_code='PARENT' and exists(
      select 1 from public.parent_student_links psl 
      where psl.parent_user_id=q.auth_user_id 
        and psl.student_id=target_student_id 
        and psl.status='ACTIVE'
   )) or
   (q.role_code='WASTE_STAFF' and exists(select 1 from public.student_class_history h where h.school_id=target_school_id
    and h.student_id=target_student_id and h.is_current and h.class_id::text=q.metadata->>'class_id')) or
   q.role_code in ('TEACHER','LIBRARY_STAFF')
  )
 );
$$;

create or replace function public.provision_portal_access(p_actor_id uuid,p_school_id uuid,p_user_id uuid,p_token_hash text,p_email text,p_role_code text,p_metadata jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare role_id uuid; member_id uuid; token_id uuid; perm text; perm_id uuid; grants text[]; begin
 if not exists(
  select 1 from public.school_users su join public.users u on u.id=su.user_id join public.schools s on s.id=su.school_id
  join public.school_user_roles sur on sur.school_id=su.school_id and sur.school_user_id=su.id
  join public.roles r on r.school_id=sur.school_id and r.id=sur.role_id
  where su.user_id=p_actor_id and su.school_id=p_school_id and su.status='ACTIVE' and su.deleted_at is null
   and u.is_active and u.deleted_at is null and s.is_active and s.status='ACTIVE' and s.deleted_at is null
   and r.is_active and r.deleted_at is null and r.code in ('SCHOOL_ADMIN','SUPER_ADMIN')
 ) or exists(select 1 from public.qr_access_tokens where auth_user_id=p_actor_id) then
  raise exception 'Admin sekolah aktif diperlukan' using errcode='42501';
 end if;
 if p_role_code not in ('WASTE_STAFF','LIBRARY_STAFF','TEACHER','PARENT') then raise exception 'Portal tidak valid' using errcode='22023'; end if;
 if p_role_code='WASTE_STAFF' and not exists(select 1 from public.classes where school_id=p_school_id and id=(p_metadata->>'class_id')::uuid and deleted_at is null and is_active) then
  raise exception 'Kelas tidak ditemukan di sekolah ini' using errcode='22023'; end if;
 grants:=case p_role_code
  when 'WASTE_STAFF' then array['student.read','waste.create','waste.read']
  when 'LIBRARY_STAFF' then array['library.read','library.visit']
  when 'TEACHER' then array['student.read','extracurricular.read','extracurricular.manage','extracurricular.attendance']
  else array[]::text[] end;
 -- Dedicated roles keep portal access separate from administrator permissions.
 insert into public.roles(school_id,code,name,is_system) values(p_school_id,'PORTAL_'||p_role_code,'Portal '||p_role_code,true)
 on conflict(school_id,code) do update set is_active=true,deleted_at=null returning id into role_id;
 foreach perm in array grants loop
  insert into public.permissions(school_id,code,description) values(p_school_id,perm,'Portal: '||perm)
   on conflict(school_id,code) do update set is_active=true,deleted_at=null returning id into perm_id;
  insert into public.role_permissions(school_id,role_id,permission_id) values(p_school_id,role_id,perm_id) on conflict do nothing;
 end loop;
 insert into public.users(id,full_name,is_active) values(p_user_id,'Portal '||p_role_code,true) on conflict(id) do nothing;
 insert into public.school_users(school_id,user_id,status,joined_at) values(p_school_id,p_user_id,'ACTIVE',now()) returning id into member_id;
 insert into public.school_user_roles(school_id,school_user_id,role_id,assigned_by) values(p_school_id,member_id,role_id,p_actor_id);
 insert into public.qr_access_tokens(school_id,token_hash,auth_user_id,shadow_email,role_code,metadata,created_by)
  values(p_school_id,p_token_hash,p_user_id,p_email,p_role_code,p_metadata,p_actor_id) returning id into token_id;
 if p_role_code='PARENT' then
  -- We just create the profile, we do not link any students yet
  insert into public.parent_profiles(user_id,full_name) values(p_user_id,'Orang Tua');
 end if;
 return token_id;
end $$;

-- RPC for linking student using NISN and DOB
create or replace function public.link_student_to_parent_portal(p_nisn text, p_dob date, p_parent_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  q public.qr_access_tokens;
  s public.students;
begin
  if not public.portal_session_active() then raise exception 'Akses portal dinonaktifkan' using errcode='42501'; end if;
  select * into q from public.qr_access_tokens where auth_user_id = auth.uid();
  if not found or q.role_code <> 'PARENT' then raise exception 'Bukan sesi portal orang tua' using errcode='42501'; end if;

  select * into s from public.students 
  where school_id = q.school_id 
    and student_number = p_nisn 
    and date_of_birth = p_dob
    and is_active = true 
    and deleted_at is null;

  if not found then raise exception 'Data anak tidak ditemukan dengan NISN dan tanggal lahir tersebut' using errcode='22023'; end if;

  if p_parent_name is not null and trim(p_parent_name) <> '' then
    update public.parent_profiles set full_name = trim(p_parent_name) where user_id = auth.uid();
  end if;

  insert into public.parent_student_links(school_id, parent_user_id, student_id, relationship, status)
  values (q.school_id, auth.uid(), s.id, 'OTHER', 'ACTIVE')
  on conflict (school_id, parent_user_id, student_id) do update set status = 'ACTIVE', revoked_at = null;

  return jsonb_build_object('success', true, 'student_id', s.id);
end $$;

revoke all on function public.link_student_to_parent_portal(text, date, text) from public;
grant execute on function public.link_student_to_parent_portal(text, date, text) to authenticated;

commit;
