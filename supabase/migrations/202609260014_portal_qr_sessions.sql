begin;

alter table public.qr_access_tokens add column revoked_at timestamptz;
alter table public.qr_access_tokens add column created_by uuid references public.users(id);
create unique index qr_access_user_unique on public.qr_access_tokens(auth_user_id);
-- The old RPC wrote directly into auth.users and accepted arbitrary roles.
revoke all on function public.generate_shadow_access(uuid,text,text,text,varchar,jsonb,timestamptz) from public, anon, authenticated;

create function public.can_manage_portal_access(target_school_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.has_school_access(target_school_id) and exists (
  select 1 from public.school_users su
  join public.school_user_roles sur on sur.school_id=su.school_id and sur.school_user_id=su.id
  join public.roles r on r.school_id=sur.school_id and r.id=sur.role_id
  where su.school_id=target_school_id and su.user_id=auth.uid() and su.status='ACTIVE' and su.deleted_at is null
   and r.code in ('SCHOOL_ADMIN','SUPER_ADMIN') and r.is_active and r.deleted_at is null
 ) and not exists(select 1 from public.qr_access_tokens where auth_user_id=auth.uid());
$$;
revoke all on function public.can_manage_portal_access(uuid) from public;
grant execute on function public.can_manage_portal_access(uuid) to authenticated;

create function public.portal_session_active() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'portal_access'='true')
   or exists(select 1 from public.qr_access_tokens where auth_user_id=auth.uid()) then exists (
    select 1 from public.qr_access_tokens q
    join public.school_users su on su.user_id=q.auth_user_id and su.school_id=q.school_id
    join public.schools s on s.id=q.school_id join public.users u on u.id=q.auth_user_id
    where q.auth_user_id=auth.uid() and q.revoked_at is null and(q.expires_at is null or q.expires_at>now())
     and su.status='ACTIVE' and su.deleted_at is null and s.status='ACTIVE' and s.is_active and s.deleted_at is null
     and u.is_active and u.deleted_at is null
   ) else true end;
$$;
revoke all on function public.portal_session_active() from public;
grant execute on function public.portal_session_active() to authenticated;

-- Even a previously issued access JWT loses table access immediately on revocation.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
  execute format('create policy portal_session_guard on public.%I as restrictive for all to authenticated using (public.portal_session_active()) with check (public.portal_session_active())', t.tablename);
 end loop;
end $$;

create function public.portal_class_allowed(target_school_id uuid,target_class_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from public.qr_access_tokens where auth_user_id=auth.uid()) or exists(
  select 1 from public.qr_access_tokens where auth_user_id=auth.uid() and school_id=target_school_id
   and (role_code<>'WASTE_STAFF' or metadata->>'class_id'=target_class_id::text)
 );
$$;
create function public.portal_student_allowed(target_school_id uuid,target_student_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from public.qr_access_tokens where auth_user_id=auth.uid()) or exists(
  select 1 from public.qr_access_tokens q where q.auth_user_id=auth.uid() and q.school_id=target_school_id and (
   (q.role_code='PARENT' and q.metadata->>'student_id'=target_student_id::text) or
   (q.role_code='WASTE_STAFF' and exists(select 1 from public.student_class_history h where h.school_id=target_school_id
    and h.student_id=target_student_id and h.is_current and h.class_id::text=q.metadata->>'class_id')) or
   q.role_code in ('TEACHER','LIBRARY_STAFF')
  )
 );
$$;
revoke all on function public.portal_class_allowed(uuid,uuid),public.portal_student_allowed(uuid,uuid) from public;
grant execute on function public.portal_class_allowed(uuid,uuid),public.portal_student_allowed(uuid,uuid) to authenticated;
create policy portal_class_scope on public.classes as restrictive for select to authenticated using(public.portal_class_allowed(school_id,id));
create policy portal_student_scope on public.students as restrictive for select to authenticated using(public.portal_student_allowed(school_id,id));
create policy portal_history_scope on public.student_class_history as restrictive for select to authenticated using(public.portal_student_allowed(school_id,student_id));
create policy portal_waste_scope on public.waste_transactions as restrictive for all to authenticated
 using(public.portal_class_allowed(school_id,class_id))
 with check(public.portal_class_allowed(school_id,class_id) and public.portal_student_allowed(school_id,student_id));

create function public.provision_portal_access(p_actor_id uuid,p_school_id uuid,p_user_id uuid,p_token_hash text,p_email text,p_role_code text,p_metadata jsonb)
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
 if p_role_code='PARENT' and not exists(select 1 from public.students where school_id=p_school_id and id=(p_metadata->>'student_id')::uuid and deleted_at is null and is_active) then
  raise exception 'Siswa tidak ditemukan di sekolah ini' using errcode='22023'; end if;
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
  insert into public.parent_profiles(user_id,full_name) values(p_user_id,'Orang Tua');
  insert into public.parent_student_links(school_id,parent_user_id,student_id,relationship,status)
   values(p_school_id,p_user_id,(p_metadata->>'student_id')::uuid,'OTHER','ACTIVE');
 end if;
 return token_id;
end $$;
revoke all on function public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb) to service_role;

create function public.get_portal_context() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare q public.qr_access_tokens; school_name text; begin
 if not public.portal_session_active() then raise exception 'Akses portal dinonaktifkan' using errcode='42501'; end if;
 select * into q from public.qr_access_tokens where auth_user_id=auth.uid();
 if not found then raise exception 'Sesi bukan portal QR' using errcode='42501'; end if;
 select name into school_name from public.schools where id=q.school_id;
 return jsonb_build_object('id',q.id,'school_id',q.school_id,'school_name',school_name,'role_code',q.role_code,'metadata',q.metadata);
end $$;
create function public.revoke_portal_access(p_token_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.qr_access_tokens; begin
 select * into q from public.qr_access_tokens where id=p_token_id for update;
 if not found or not public.can_manage_portal_access(q.school_id) then raise exception 'Akses ditolak' using errcode='42501'; end if;
 update public.qr_access_tokens set revoked_at=now() where id=q.id;
 update public.school_users set status='REVOKED' where user_id=q.auth_user_id and school_id=q.school_id;
 update public.parent_student_links set status='REVOKED',revoked_at=now() where parent_user_id=q.auth_user_id and school_id=q.school_id;
end $$;
revoke all on function public.get_portal_context(),public.revoke_portal_access(uuid) from public;
grant execute on function public.get_portal_context(),public.revoke_portal_access(uuid) to authenticated;

-- Human library portal visits do not impersonate a physical device.
alter table public.library_visits alter column device_id drop not null;
create function public.record_portal_library_visit(target_school_id uuid,p_event_id uuid,p_card_uid text,p_occurred_at timestamptz,p_local_sequence bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.student_cards; v public.library_visits; cid uuid; begin
 if not public.portal_session_active() or not public.has_school_access(target_school_id) or not public.has_school_permission(target_school_id,'library.visit') then
  raise exception 'Akses perpustakaan ditolak' using errcode='42501'; end if;
 if p_local_sequence<0 or p_occurred_at>now()+interval '10 minutes' then raise exception 'Waktu kunjungan tidak valid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_school_id::text||p_event_id::text,0));
 select * into v from public.library_visits where school_id=target_school_id and event_id=p_event_id;
 if found then return jsonb_build_object('id',v.id,'duplicate',true); end if;
 select * into c from public.student_cards where school_id=target_school_id and upper(card_uid)=upper(p_card_uid)
  and status='ACTIVE' and(expires_at is null or expires_at>p_occurred_at) limit 1;
 if not found then raise exception 'Kartu tidak ditemukan atau tidak aktif' using errcode='AG004'; end if;
 select class_id into cid from public.student_class_history where school_id=target_school_id and student_id=c.student_id and is_current;
 insert into public.library_visits(event_id,school_id,device_id,student_id,class_id,occurred_at,local_sequence,source,metadata)
  values(p_event_id,target_school_id,null,c.student_id,cid,p_occurred_at,p_local_sequence,'REALTIME',jsonb_build_object('portal_user_id',auth.uid())) returning * into v;
 insert into public.library_events(school_id,event_type,aggregate_id,payload) values(target_school_id,'library.visit.created',v.id,to_jsonb(v));
 return jsonb_build_object('id',v.id,'student_id',v.student_id,'duplicate',false);
end $$;
revoke all on function public.record_portal_library_visit(uuid,uuid,text,timestamptz,bigint) from public;
grant execute on function public.record_portal_library_visit(uuid,uuid,text,timestamptz,bigint) to authenticated;
commit;
