begin;
-- Trusted Auth app_metadata only. Never promote legacy tenant roles automatically.
create function public.is_platform_admin() returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from auth.users a join public.users u on u.id=a.id where a.id=auth.uid()
 and a.raw_app_meta_data->>'platform_role'='SUPER_ADMIN' and coalesce(a.raw_app_meta_data->>'portal_access','false')<>'true'
 and u.is_active and u.deleted_at is null);
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
create or replace function public.has_school_access(target_school_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.schools s where s.id=target_school_id and s.deleted_at is null and (
 public.is_platform_admin() or (s.is_active and s.status='ACTIVE' and exists(select 1 from public.school_users su join public.users u on u.id=su.user_id where su.school_id=s.id and su.user_id=auth.uid() and su.status='ACTIVE' and su.deleted_at is null and u.is_active and u.deleted_at is null))));
$$;
create or replace function public.has_school_permission(target_school_id uuid, permission_code text) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select public.has_school_access(target_school_id) and (public.is_platform_admin() or exists(
 select 1 from public.school_users su join public.school_user_roles sur on sur.school_id=su.school_id and sur.school_user_id=su.id
 join public.roles r on r.school_id=sur.school_id and r.id=sur.role_id join public.role_permissions rp on rp.school_id=r.school_id and rp.role_id=r.id
 join public.permissions p on p.school_id=rp.school_id and p.id=rp.permission_id
 where su.school_id=target_school_id and su.user_id=auth.uid() and su.status='ACTIVE' and su.deleted_at is null
 and r.is_active and r.deleted_at is null and r.code<>'SUPER_ADMIN' and p.is_active and p.deleted_at is null and p.code=permission_code));
$$;
revoke all on function public.has_school_access(uuid) from public;
grant execute on function public.has_school_access(uuid) to authenticated;
create function public.protect_platform_role() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.code='SUPER_ADMIN' then raise exception 'Platform authority cannot be assigned through school roles' using errcode='42501'; end if; return new;
end $$;
create trigger protect_platform_role before insert or update on public.roles for each row execute function public.protect_platform_role();
create policy platform_profile_read on public.users for select to authenticated using(public.is_platform_admin());
create policy platform_audit_read on public.audit_logs for select to authenticated using(public.is_platform_admin());

create function public.configure_school_roles(target uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare r record; codes text[]:=array['academic.manage','student.read','student.create','student.update','card.read','card.manage','card.write','device.read','device.manage','attendance.read','attendance.manage','iam.manage','library.read','library.visit','library.manage','waste.read','waste.create','waste.manage','extracurricular.read','extracurricular.manage','extracurricular.attendance','led.read','led.manage','dashboard.read','audit.read','report.read','parent.manage','privacy.manage'];
begin
 insert into public.permissions(school_id,code) select target,unnest(codes) on conflict(school_id,code) do nothing;
 insert into public.roles(school_id,code,name,is_system) select target,x,x,true from unnest(array['SCHOOL_ADMIN','TEACHER','EXTRA_TEACHER','LIBRARY_STAFF','WASTE_STAFF','PARENT']) x on conflict(school_id,code) do nothing;
 for r in select id,code from public.roles where school_id=target and code in ('SCHOOL_ADMIN','TEACHER','EXTRA_TEACHER','LIBRARY_STAFF','WASTE_STAFF') loop
 insert into public.role_permissions(school_id,role_id,permission_id) select target,r.id,p.id from public.permissions p where p.school_id=target and (
 r.code='SCHOOL_ADMIN' or (r.code='TEACHER' and p.code=any(array['dashboard.read','student.read','attendance.read','report.read'])) or
 (r.code='EXTRA_TEACHER' and p.code=any(array['student.read','extracurricular.read','extracurricular.attendance'])) or
 (r.code='LIBRARY_STAFF' and p.code=any(array['student.read','library.read','library.visit','library.manage'])) or
 (r.code='WASTE_STAFF' and p.code=any(array['student.read','waste.read','waste.create','waste.manage']))) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.configure_school_roles(uuid) from public,anon,authenticated;
-- Repair existing school catalogs without granting platform authority.
do $$declare s record; begin for s in select id from public.schools where deleted_at is null loop perform public.configure_school_roles(s.id);end loop;end$$;

create table public.platform_operations(id uuid primary key,actor_id uuid not null references public.users(id),kind text not null,school_id uuid references public.schools(id),user_id uuid references public.users(id),request_hash text not null,created_at timestamptz not null default now());
alter table public.platform_operations enable row level security;
revoke all on public.platform_operations from anon,authenticated;
create function public.provision_school(p_operation uuid,p_actor uuid,p_user uuid,p_name text,p_code text,p_timezone text,p_full_name text,p_existing_school uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare sid uuid; mid uuid; rid uuid; existing public.platform_operations;
begin
 if not exists(select 1 from auth.users a join public.users u on u.id=a.id where a.id=p_actor and a.raw_app_meta_data->>'platform_role'='SUPER_ADMIN' and u.is_active and u.deleted_at is null) then raise exception 'Platform authority required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into existing from public.platform_operations where id=p_operation;
 if found then if existing.actor_id<>p_actor or existing.request_hash<>p_hash then raise exception 'Idempotency key conflict';end if;return jsonb_build_object('school_id',existing.school_id,'user_id',existing.user_id);end if;
 if p_existing_school is null then insert into public.schools(code,name,timezone) values(p_code,p_name,p_timezone) returning id into sid;
 else select id into sid from public.schools where id=p_existing_school and deleted_at is null for update;if not found then raise exception 'School not found' using errcode='P0002';end if;end if;
 perform public.configure_school_roles(sid);
 insert into public.users(id,full_name) values(p_user,p_full_name) on conflict(id) do nothing;
 insert into public.school_users(school_id,user_id,status,joined_at) values(sid,p_user,'ACTIVE',now()) returning id into mid;
 select id into rid from public.roles where school_id=sid and code='SCHOOL_ADMIN';
 insert into public.school_user_roles(school_id,school_user_id,role_id,assigned_by) values(sid,mid,rid,p_actor);
 insert into public.platform_operations values(p_operation,p_actor,case when p_existing_school is null then 'SCHOOL_CREATE' else 'ADMIN_CREATE' end,sid,p_user,p_hash,now());
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,after_data) values(sid,p_actor,'SCHOOL_ADMIN_PROVISIONED','school_users',mid,jsonb_build_object('school_id',sid,'user_id',p_user));
 return jsonb_build_object('school_id',sid,'user_id',p_user);
end $$;
revoke all on function public.provision_school(uuid,uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.provision_school(uuid,uuid,uuid,text,text,text,text,uuid,text) to service_role;
commit;
