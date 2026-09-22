begin;

create type public.led_content_priority as enum ('RUNNING_TEXT','NORMAL_DASHBOARD','ACHIEVEMENT','ADMIN_OVERRIDE','EMERGENCY');

create table public.led_content (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  priority public.led_content_priority not null, title varchar(160), body text not null,
  starts_at timestamptz not null default now(), ends_at timestamptz, is_active boolean not null default true,
  version bigint generated always as identity, created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(school_id,id), check(btrim(body)<>''), check(ends_at is null or ends_at>starts_at)
);
create table public.led_gateway_heartbeats (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), device_id uuid not null,
  firmware_version varchar(50) not null, controller_online boolean not null, cached_content_id uuid,
  last_error text, reported_at timestamptz not null, received_at timestamptz not null default now(),
  foreign key(school_id,device_id) references public.devices(school_id,id),
  foreign key(school_id,cached_content_id) references public.led_content(school_id,id)
);
create table public.led_acknowledgements (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), device_id uuid not null,
  content_id uuid not null, content_version bigint not null, success boolean not null, error_code varchar(80),
  acknowledged_at timestamptz not null default now(), unique(school_id,device_id,content_id,content_version),
  foreign key(school_id,device_id) references public.devices(school_id,id),
  foreign key(school_id,content_id) references public.led_content(school_id,id)
);
create index led_content_active_idx on public.led_content(school_id,priority,starts_at desc) where is_active;
create index led_heartbeat_device_idx on public.led_gateway_heartbeats(school_id,device_id,received_at desc);

create trigger led_content_updated_at before update on public.led_content for each row execute function public.set_updated_at();
alter table public.led_content enable row level security; alter table public.led_content force row level security;
alter table public.led_gateway_heartbeats enable row level security; alter table public.led_gateway_heartbeats force row level security;
alter table public.led_acknowledgements enable row level security; alter table public.led_acknowledgements force row level security;
create policy led_content_read on public.led_content for select to authenticated using(public.has_school_permission(school_id,'led.read'));
create policy led_content_manage on public.led_content for all to authenticated using(public.has_school_permission(school_id,'led.manage')) with check(public.has_school_permission(school_id,'led.manage'));
create policy led_heartbeats_read on public.led_gateway_heartbeats for select to authenticated using(public.has_school_permission(school_id,'led.read'));
create policy led_ack_read on public.led_acknowledgements for select to authenticated using(public.has_school_permission(school_id,'led.read'));
grant select,insert,update,delete on public.led_content to authenticated;
grant select on public.led_gateway_heartbeats,public.led_acknowledgements to authenticated;

create function public.get_led_gateway_state(target_device_id uuid,device_secret text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices; c public.led_content;
begin
 select dv into d from public.devices dv join public.device_credentials dc on dc.device_id=dv.id and dc.school_id=dv.school_id
 where dv.id=target_device_id and dv.device_type='LED' and dv.status='ACTIVE' and dv.deleted_at is null
 and dc.secret_hash=encode(digest(device_secret,'sha256'),'hex') and dc.revoked_at is null and (dc.expires_at is null or dc.expires_at>now()) limit 1;
 if not found then raise exception 'invalid led credential' using errcode='28000'; end if;
 select * into c from public.led_content where school_id=d.school_id and is_active and starts_at<=now() and (ends_at is null or ends_at>now())
 order by case priority when 'EMERGENCY' then 5 when 'ADMIN_OVERRIDE' then 4 when 'ACHIEVEMENT' then 3 when 'NORMAL_DASHBOARD' then 2 else 1 end desc, starts_at desc limit 1;
 update public.device_credentials set last_used_at=now() where device_id=d.id and secret_hash=encode(digest(device_secret,'sha256'),'hex');
 if c.id is null then return jsonb_build_object('mode','FALLBACK','content',null,'server_time',now()); end if;
 return jsonb_build_object('mode','LIVE','server_time',now(),'content',jsonb_build_object('id',c.id,'priority',c.priority,'title',c.title,'body',c.body,'version',c.version,'ends_at',c.ends_at));
end $$;
create function public.record_led_heartbeat(target_device_id uuid,device_secret text,p_firmware_version text,p_controller_online boolean,p_cached_content_id uuid,p_last_error text,p_reported_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare state jsonb; sid uuid; row_id uuid;
begin
 state:=public.get_led_gateway_state(target_device_id,device_secret);
 select school_id into sid from public.devices where id=target_device_id;
 insert into public.led_gateway_heartbeats(school_id,device_id,firmware_version,controller_online,cached_content_id,last_error,reported_at)
 values(sid,target_device_id,p_firmware_version,p_controller_online,p_cached_content_id,p_last_error,p_reported_at) returning id into row_id;
 update public.devices set last_seen_at=now(),firmware_version=p_firmware_version where id=target_device_id;
 return jsonb_build_object('heartbeat_id',row_id,'state',state);
end $$;
create function public.acknowledge_led_content(target_device_id uuid,device_secret text,p_content_id uuid,p_content_version bigint,p_success boolean,p_error_code text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare state jsonb; sid uuid; row_id uuid;
begin
 state:=public.get_led_gateway_state(target_device_id,device_secret); select school_id into sid from public.devices where id=target_device_id;
 insert into public.led_acknowledgements(school_id,device_id,content_id,content_version,success,error_code)
 values(sid,target_device_id,p_content_id,p_content_version,p_success,p_error_code)
 on conflict(school_id,device_id,content_id,content_version) do update set success=excluded.success,error_code=excluded.error_code,acknowledged_at=now()
 returning id into row_id; return jsonb_build_object('acknowledgement_id',row_id,'accepted',true);
end $$;
revoke all on function public.get_led_gateway_state(uuid,text),public.record_led_heartbeat(uuid,text,text,boolean,uuid,text,timestamptz),public.acknowledge_led_content(uuid,text,uuid,bigint,boolean,text) from public,authenticated;
grant execute on function public.get_led_gateway_state(uuid,text),public.record_led_heartbeat(uuid,text,text,boolean,uuid,text,timestamptz),public.acknowledge_led_content(uuid,text,uuid,bigint,boolean,text) to anon;
commit;
