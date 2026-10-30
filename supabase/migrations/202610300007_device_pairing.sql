begin;
create table public.device_pairing_tokens(id uuid primary key default gen_random_uuid(),school_id uuid not null,device_id uuid not null,token_hash text unique not null,created_by uuid not null references public.users(id),expires_at timestamptz not null default now()+interval '10 minutes',used_at timestamptz,foreign key(school_id,device_id) references public.devices(school_id,id),check(token_hash ~ '^[a-f0-9]{64}$'));
alter table public.device_pairing_tokens enable row level security;
revoke all on public.device_pairing_tokens from public,anon,authenticated;
create function public.create_device_pairing(p_device uuid,p_hash text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices; result uuid;
begin
 select * into d from public.devices where id=p_device and deleted_at is null and status in ('PROVISIONING','ACTIVE');
 if not found or not public.portal_session_active() or not public.has_school_permission(d.school_id,'device.manage') then raise exception 'Device pairing denied' using errcode='42501'; end if;
 insert into public.device_pairing_tokens(school_id,device_id,token_hash,created_by) values(d.school_id,d.id,p_hash,auth.uid()) returning id into result;
 perform public.family_audit(d.school_id,'device.pairing.created',d.id);
 return result;
end $$;
create function public.exchange_device_pairing(p_hash text,p_secret_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.device_pairing_tokens;
begin
 select * into t from public.device_pairing_tokens where token_hash=p_hash and used_at is null and expires_at>now() for update;
 if not found or not exists(select 1 from public.devices d join public.schools s on s.id=d.school_id where d.id=t.device_id and d.deleted_at is null and d.status in ('PROVISIONING','ACTIVE') and s.is_active and s.status='ACTIVE' and s.deleted_at is null)
 then raise exception 'Invalid pairing' using errcode='42501'; end if;
 update public.device_credentials set revoked_at=now() where device_id=t.device_id and revoked_at is null;
 insert into public.device_credentials(school_id,device_id,secret_hash,label) values(t.school_id,t.device_id,p_secret_hash,'paired');
 update public.device_pairing_tokens set used_at=now() where id=t.id;
 update public.devices set status='ACTIVE' where id=t.device_id;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id) values(t.school_id,t.created_by,'device.pairing.exchanged','device',t.device_id);
 return jsonb_build_object('device_id',t.device_id,'school_id',t.school_id);
end $$;
revoke all on function public.create_device_pairing(uuid,text),public.exchange_device_pairing(text,text) from public,anon,authenticated;
grant execute on function public.create_device_pairing(uuid,text) to authenticated;
grant execute on function public.exchange_device_pairing(text,text) to service_role;
-- Self-edit must never toggle account activation after administrative disablement.
revoke update on public.users from authenticated;
grant update(full_name,phone,avatar_url) on public.users to authenticated;
create policy medical_active_guard on public.parent_permit_attachments as restrictive for select to authenticated using(public.portal_session_active());
create function public.cleanup_expired_runtime_artifacts() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 delete from public.report_exports where expires_at<now();
 delete from public.api_rate_buckets where reset_at<now()-interval '1 hour';
 delete from public.device_pairing_tokens where expires_at<now()-interval '1 day';
end $$;
revoke all on function public.cleanup_expired_runtime_artifacts() from public,anon,authenticated;
grant execute on function public.cleanup_expired_runtime_artifacts() to service_role;
commit;
