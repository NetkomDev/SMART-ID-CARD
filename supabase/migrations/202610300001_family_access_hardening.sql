begin;
-- Individual verified identities replace shared QR/device-based authorization.
create or replace function public.is_individual_parent() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from auth.users a join public.users u on u.id=a.id
 where a.id=auth.uid() and a.email_confirmed_at is not null
 and coalesce(a.raw_app_meta_data->>'portal_access','false') <> 'true'
 and not exists(select 1 from public.qr_access_tokens q where q.auth_user_id=a.id)
 and u.is_active and u.deleted_at is null);
$$;
revoke all on function public.is_individual_parent() from public,anon;
grant execute on function public.is_individual_parent() to authenticated;

alter table public.parent_student_links add column verified_at timestamptz;
alter table public.parent_student_links add column verification_source text;
-- Old links have no reliable family identity provenance. Preserve history; require new claim.
update public.parent_student_links set status='REVOKED',revoked_at=coalesce(revoked_at,now()),verification_source='LEGACY_REVERIFY';
create unique index parent_verified_identity_idx on public.parent_student_links(school_id,parent_user_id,student_id) where verified_at is not null;

create or replace function public.can_access_parent_child(p_student_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.is_individual_parent() and exists(
 select 1 from public.parent_student_links l
 join public.students s on s.id=l.student_id and s.school_id=l.school_id
 join public.schools sc on sc.id=s.school_id
 where l.parent_user_id=auth.uid() and l.student_id=p_student_id and l.status='ACTIVE' and l.verified_at is not null
 and s.is_active and s.deleted_at is null and sc.is_active and sc.status='ACTIVE' and sc.deleted_at is null);
$$;
revoke all on function public.can_access_parent_child(uuid) from public,anon;
grant execute on function public.can_access_parent_child(uuid) to authenticated;

-- Restrictive guards also constrain older permissive policies.
create policy family_principal_guard on public.parent_student_links as restrictive for all to authenticated
 using(public.is_individual_parent()) with check(public.is_individual_parent());
drop policy if exists parent_links_self_select on public.parent_student_links;
create policy parent_links_self_select on public.parent_student_links for select to authenticated
 using(parent_user_id=auth.uid() and verified_at is not null and public.can_access_parent_child(student_id));
create policy family_profile_guard on public.parent_profiles as restrictive for all to authenticated
 using(public.is_individual_parent()) with check(public.is_individual_parent());
-- Parent writes go through validated functions; administrative writes remain permission scoped.
drop policy if exists student_absence_permits_parent_all on public.student_absence_permits;
create policy permits_parent_read on public.student_absence_permits for select to authenticated
 using(public.can_access_parent_child(student_id));
create policy permits_admin on public.student_absence_permits for all to authenticated
 using(public.has_school_permission(school_id,'attendance.manage'))
 with check(public.has_school_permission(school_id,'attendance.manage'));
create policy permits_active_guard on public.student_absence_permits as restrictive for all to authenticated
 using(public.portal_session_active()) with check(public.portal_session_active());
alter table public.student_absence_permits add constraint permits_tenant_student_fk
 foreign key(school_id,student_id) references public.students(school_id,id) not valid;

-- Durable audit inside each family transaction, no raw photo/token/medical notes.
create or replace function public.family_audit(p_school uuid,p_action text,p_resource uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id)
 values(p_school,auth.uid(),p_action,'parent',p_resource);
end $$;
revoke all on function public.family_audit(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.ensure_parent_profile(p_name text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from auth.users a where a.id=auth.uid() and a.email_confirmed_at is not null
 and coalesce(a.raw_app_meta_data->>'portal_access','false')<>'true'
 and not exists(select 1 from public.qr_access_tokens q where q.auth_user_id=a.id))
 then raise exception 'Individual verified account required' using errcode='42501'; end if;
 if length(btrim(p_name)) not between 1 and 200 then raise exception 'Invalid profile name' using errcode='22023'; end if;
 insert into public.users(id,full_name) values(auth.uid(),btrim(p_name)) on conflict(id) do nothing;
 if not public.is_individual_parent() then raise exception 'Account disabled' using errcode='42501'; end if;
 insert into public.parent_profiles(user_id,full_name) values(auth.uid(),btrim(p_name)) on conflict(user_id) do nothing;
end $$;
revoke all on function public.ensure_parent_profile(text) from public,anon;
grant execute on function public.ensure_parent_profile(text) to authenticated;

create table public.parent_claim_attempts(user_id uuid primary key references auth.users(id),window_start timestamptz not null, failures int not null default 0);
alter table public.parent_claim_attempts enable row level security;
revoke all on public.parent_claim_attempts from public,anon,authenticated;
create function public.claim_parent_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare t public.parent_link_tokens; link_id uuid; a public.parent_claim_attempts;
begin
 if not public.is_individual_parent() then raise exception 'Individual verified account required' using errcode='42501'; end if;
 insert into public.parent_claim_attempts values(auth.uid(),clock_timestamp(),0) on conflict do nothing;
 select * into a from public.parent_claim_attempts where user_id=auth.uid() for update;
 if a.window_start < clock_timestamp()-interval '15 minutes' then
 update public.parent_claim_attempts set window_start=clock_timestamp(),failures=0 where user_id=auth.uid(); a.failures:=0;
 end if;
 if a.failures>=5 then return jsonb_build_object('accepted',false,'code','RATE_LIMITED'); end if;
 select lt.* into t from public.parent_link_tokens lt join public.students s on s.school_id=lt.school_id and s.id=lt.student_id
 join public.schools sc on sc.id=s.school_id
 where lt.token_hash=encode(digest(p_token,'sha256'),'hex') and lt.used_at is null and lt.expires_at>now()
 and s.is_active and s.deleted_at is null and sc.is_active and sc.status='ACTIVE' and sc.deleted_at is null for update of lt;
 if not found then
 update public.parent_claim_attempts set failures=failures+1 where user_id=auth.uid();
 return jsonb_build_object('accepted',false,'code','PARENT_LINK_INVALID');
 end if;
 insert into public.parent_student_links(school_id,parent_user_id,student_id,relationship,status,verified_at,verification_source)
 values(t.school_id,auth.uid(),t.student_id,t.relationship,'ACTIVE',now(),'SCHOOL_INVITATION')
 on conflict(school_id,parent_user_id,student_id) where verified_at is not null
 do update set status='ACTIVE',revoked_at=null,verified_at=now(),relationship=excluded.relationship
 returning id into link_id;
 update public.parent_link_tokens set used_at=now() where id=t.id;
 perform public.family_audit(t.school_id,'parent.link.claimed',link_id);
 return jsonb_build_object('accepted',true,'link_id',link_id,'student_id',t.student_id);
end $$;
revoke all on function public.claim_parent_invitation(text) from public,anon;
grant execute on function public.claim_parent_invitation(text) to authenticated;

create function public.get_verified_parent_children()
returns table(link_id uuid,student_id uuid,school_id uuid,school_name varchar,full_name varchar,student_number varchar,class_name varchar,relationship public.parent_relationship,photo_url text)
language sql stable security definer set search_path=pg_catalog,public as $$
 select l.id,s.id,s.school_id,sc.name,s.full_name,s.student_number,c.name,l.relationship,s.photo_url
 from public.parent_student_links l join public.students s on s.id=l.student_id and s.school_id=l.school_id
 join public.schools sc on sc.id=s.school_id
 left join public.student_class_history h on h.school_id=s.school_id and h.student_id=s.id and h.is_current
 left join public.classes c on c.school_id=h.school_id and c.id=h.class_id
 where l.parent_user_id=auth.uid() and l.status='ACTIVE' and l.verified_at is not null and public.can_access_parent_child(s.id);
$$;
revoke all on function public.get_verified_parent_children() from public,anon;
grant execute on function public.get_verified_parent_children() to authenticated;

create or replace function public.update_student_photo_by_parent(p_student_id uuid,p_photo_data text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare sid uuid;
begin
 if not public.can_access_parent_child(p_student_id) then raise exception 'Child access denied' using errcode='42501'; end if;
 if p_photo_data is null or length(p_photo_data)>4000000 or p_photo_data !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$'
 then raise exception 'Canonical JPEG required' using errcode='22023'; end if;
 update public.students set photo_url=p_photo_data where id=p_student_id returning school_id into sid;
 perform public.family_audit(sid,'parent.photo.updated',p_student_id);
 return jsonb_build_object('success',true,'student_id',p_student_id);
end $$;
revoke all on function public.update_student_photo_by_parent(uuid,text) from public,anon;
grant execute on function public.update_student_photo_by_parent(uuid,text) to authenticated;

-- Revoke every historical overload, including lookup-by-DOB and shared device functions.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
 and proname in ('claim_parent_link','link_student_to_parent_portal','get_parent_children','get_parent_child_today') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
