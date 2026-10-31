begin;
-- Seven-argument calls must not compete with an eight-argument default overload.
drop function public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb,text);
create or replace function public.provision_portal_access(
  p_actor_id uuid,
  p_school_id uuid,
  p_user_id uuid,
  p_token_hash text,
  p_email text,
  p_role_code text,
  p_metadata jsonb,
  p_token text
)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare role_id uuid; member_id uuid; token_id uuid; perm text; perm_id uuid; grants text[]; begin
 if not exists(select 1 from public.school_users su join public.users u on u.id=su.user_id join public.schools s on s.id=su.school_id
 join auth.users a on a.id=su.user_id
 join public.school_user_roles sur on sur.school_id=su.school_id and sur.school_user_id=su.id
 join public.roles r on r.school_id=sur.school_id and r.id=sur.role_id
 where su.user_id=p_actor_id and su.school_id=p_school_id and su.status='ACTIVE' and su.deleted_at is null
 and u.is_active and u.deleted_at is null and s.is_active and s.status='ACTIVE' and s.deleted_at is null
 and r.is_active and r.deleted_at is null and r.code='SCHOOL_ADMIN'
 and coalesce(a.raw_app_meta_data->>'platform_role','')<>'SUPER_ADMIN'
 and coalesce(a.raw_app_meta_data->>'portal_access','false')<>'true'
 and not exists(select 1 from public.qr_access_tokens where auth_user_id=p_actor_id)) then
  raise exception 'Admin sekolah aktif diperlukan' using errcode='42501';
 end if;
 if p_role_code not in ('WASTE_STAFF','LIBRARY_STAFF','TEACHER','PARENT','GATE_STAFF') then raise exception 'Portal tidak valid' using errcode='22023'; end if;
 if p_role_code='WASTE_STAFF' and not exists(select 1 from public.classes where school_id=p_school_id and id=(p_metadata->>'class_id')::uuid and deleted_at is null and is_active) then
  raise exception 'Kelas tidak ditemukan di sekolah ini' using errcode='22023'; end if;
 grants:=case p_role_code
  when 'WASTE_STAFF' then array['student.read','waste.create','waste.read']
  when 'LIBRARY_STAFF' then array['library.read','library.visit']
  when 'TEACHER' then array['student.read','extracurricular.read','extracurricular.manage','extracurricular.attendance']
  when 'GATE_STAFF' then array['student.read','attendance.read','attendance.scan']
  else array[]::text[] end;
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
 insert into public.qr_access_tokens(school_id,token_hash,auth_user_id,shadow_email,role_code,metadata,created_by,token)
  values(p_school_id,p_token_hash,p_user_id,p_email,p_role_code,p_metadata,p_actor_id,p_token) returning id into token_id;
 if p_role_code='PARENT' then
  insert into public.parent_profiles(user_id,full_name) values(p_user_id,'Orang Tua');
 end if;
 return token_id;
end $$;

revoke all on function public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb,text) to service_role;

-- An attendance portal may bind only its own mobile scanner, never an existing device in another school.
create or replace function public.bind_attendance_scanner(p_device_id uuid, p_scanner_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare context jsonb; school uuid; existing public.devices;
begin
  context:=public.get_portal_context();
  if context is null or context->>'role_code'<>'GATE_STAFF' then
    raise exception 'Portal kehadiran diperlukan' using errcode='42501';
  end if;
  school:=(context->>'school_id')::uuid;
  if not public.can_scan_school_attendance(school) then raise exception 'Akses kehadiran tidak aktif' using errcode='42501'; end if;
  if p_device_id is null or length(btrim(coalesce(p_scanner_name,''))) not between 1 and 100 then raise exception 'Identitas petugas tidak valid' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-device:'||p_device_id::text,0));
  select * into existing from public.devices where id=p_device_id for update;
  if found and (existing.school_id<>school or existing.device_type<>'GATE' or existing.deleted_at is not null or coalesce(existing.config->>'is_mobile_pwa','false')<>'true') then
    raise exception 'Perangkat tidak tersedia untuk portal ini' using errcode='42501';
  end if;
  if existing.id is null then
    insert into public.devices(id,school_id,device_code,device_type,name,status,last_seen_at,config)
    values(p_device_id,school,'pwa-'||p_device_id::text,'GATE',btrim(p_scanner_name),'ACTIVE',now(),jsonb_build_object('is_mobile_pwa',true,'scanner_name',btrim(p_scanner_name),'bound_at',now()));
  else
    update public.devices set name=btrim(p_scanner_name),status='ACTIVE',last_seen_at=now(),config=coalesce(config,'{}'::jsonb)||jsonb_build_object('scanner_name',btrim(p_scanner_name),'updated_at',now()) where id=p_device_id;
  end if;
  update public.qr_access_tokens set last_used_at=now() where id=(context->>'id')::uuid and school_id=school;
  return jsonb_build_object('bound',true,'device_id',p_device_id,'scanner_name',btrim(p_scanner_name));
end $$;
revoke all on function public.bind_attendance_scanner(uuid,text) from public,anon;
grant execute on function public.bind_attendance_scanner(uuid,text) to authenticated;
commit;
