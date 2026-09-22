-- AKSIS Phase 04-05: atomic academic transitions and device credentials/telemetry.
begin;

alter table public.devices
  add column config jsonb not null default '{}'::jsonb,
  add constraint devices_config_object check (jsonb_typeof(config) = 'object');

create table public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  device_id uuid not null,
  secret_hash text not null,
  label varchar(100),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint device_credentials_device_fk foreign key (school_id, device_id)
    references public.devices(school_id, id) on delete cascade,
  constraint device_credentials_hash_key unique (secret_hash),
  constraint device_credentials_hash_format check (secret_hash ~ '^[a-f0-9]{64}$')
);

create table public.device_heartbeats (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  device_id uuid not null,
  uptime_seconds bigint not null,
  signal_strength smallint,
  firmware_version varchar(50) not null,
  storage_status jsonb not null default '{}'::jsonb,
  last_error text,
  reported_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint device_heartbeats_device_fk foreign key (school_id, device_id)
    references public.devices(school_id, id) on delete cascade,
  constraint device_heartbeats_uptime_nonnegative check (uptime_seconds >= 0),
  constraint device_heartbeats_signal_range check (signal_strength is null or signal_strength between -150 and 0),
  constraint device_heartbeats_storage_object check (jsonb_typeof(storage_status) = 'object'),
  constraint device_heartbeats_firmware_not_blank check (btrim(firmware_version) <> '')
);

create index device_credentials_active_idx
  on public.device_credentials (device_id) where revoked_at is null;
create index device_heartbeats_device_received_idx
  on public.device_heartbeats (school_id, device_id, received_at desc);

alter table public.device_credentials enable row level security;
alter table public.device_credentials force row level security;
alter table public.device_heartbeats enable row level security;
alter table public.device_heartbeats force row level security;

create policy device_credentials_insert on public.device_credentials for insert to authenticated
  with check (public.has_school_permission(school_id, 'device.manage'));
create policy device_credentials_update on public.device_credentials for update to authenticated
  using (public.has_school_permission(school_id, 'device.manage'))
  with check (public.has_school_permission(school_id, 'device.manage'));
create policy device_heartbeats_select on public.device_heartbeats for select to authenticated
  using (public.has_school_permission(school_id, 'device.read'));

grant insert, update on public.device_credentials to authenticated;
grant select on public.device_heartbeats to authenticated;

-- Switching periods is a single transaction and therefore never violates the
-- partial unique index that permits only one active year per school.
create function public.switch_academic_year(target_school_id uuid, target_academic_year_id uuid)
returns public.academic_years
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_year public.academic_years;
begin
  if not public.has_school_permission(target_school_id, 'academic.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into selected_year
  from public.academic_years
  where school_id = target_school_id and id = target_academic_year_id and deleted_at is null
  for update;
  if not found then
    raise exception 'academic year not found' using errcode = 'P0002';
  end if;

  update public.academic_years
  set is_active = false
  where school_id = target_school_id and is_active and id <> target_academic_year_id;
  update public.academic_years
  set is_active = true
  where school_id = target_school_id and id = target_academic_year_id
  returning * into selected_year;
  return selected_year;
end;
$$;

-- Class promotion closes the current record and inserts the next assignment
-- atomically. Composite foreign keys still enforce school/year consistency.
create function public.record_student_class_history(
  target_school_id uuid,
  target_student_id uuid,
  target_class_id uuid,
  target_academic_year_id uuid,
  effective_start_date date
)
returns public.student_class_history
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  history_row public.student_class_history;
begin
  if not public.has_school_permission(target_school_id, 'student.update') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.students
  where school_id = target_school_id and id = target_student_id and deleted_at is null
  for update;
  if not found then
    raise exception 'student not found' using errcode = 'P0002';
  end if;

  update public.student_class_history
  set is_current = false, end_date = effective_start_date - 1
  where school_id = target_school_id and student_id = target_student_id and is_current;

  insert into public.student_class_history (
    school_id, student_id, class_id, academic_year_id, start_date, is_current
  ) values (
    target_school_id, target_student_id, target_class_id,
    target_academic_year_id, effective_start_date, true
  ) returning * into history_row;
  return history_row;
end;
$$;

-- Device-facing functions authenticate a high-entropy per-device token and do
-- not rely on a user JWT or caller-supplied school identifier.
create function public.register_device(
  target_school_id uuid,
  new_device_code text,
  new_device_type public.device_type,
  new_name text,
  new_location text,
  new_hardware_version text,
  new_firmware_version text,
  new_update_channel text,
  new_config jsonb,
  new_secret_hash text
)
returns public.devices
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  device_row public.devices;
begin
  if not public.has_school_permission(target_school_id, 'device.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_secret_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid secret hash' using errcode = '22023';
  end if;

  insert into public.devices (
    school_id, device_code, device_type, name, location, hardware_version,
    firmware_version, update_channel, status, config
  ) values (
    target_school_id, new_device_code, new_device_type, new_name, new_location,
    new_hardware_version, new_firmware_version, new_update_channel, 'ACTIVE',
    coalesce(new_config, '{}'::jsonb)
  ) returning * into device_row;
  insert into public.device_credentials (school_id, device_id, secret_hash, label)
  values (target_school_id, device_row.id, new_secret_hash, 'initial');
  return device_row;
end;
$$;

create function public.record_device_heartbeat(
  target_device_id uuid,
  device_secret text,
  heartbeat_uptime_seconds bigint,
  heartbeat_signal_strength smallint,
  heartbeat_firmware_version text,
  heartbeat_storage_status jsonb,
  heartbeat_last_error text,
  heartbeat_reported_at timestamptz
)
returns public.device_heartbeats
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  device_row public.devices;
  heartbeat_row public.device_heartbeats;
begin
  select d.* into device_row
  from public.devices d
  join public.device_credentials dc on dc.device_id = d.id and dc.school_id = d.school_id
  where d.id = target_device_id
    and d.status = 'ACTIVE'
    and d.deleted_at is null
    and dc.secret_hash = encode(digest(device_secret, 'sha256'), 'hex')
    and dc.revoked_at is null
    and (dc.expires_at is null or dc.expires_at > now())
  for update of d;
  if not found then
    raise exception 'invalid device credential' using errcode = '28000';
  end if;

  insert into public.device_heartbeats (
    school_id, device_id, uptime_seconds, signal_strength, firmware_version,
    storage_status, last_error, reported_at
  ) values (
    device_row.school_id, device_row.id, heartbeat_uptime_seconds,
    heartbeat_signal_strength, heartbeat_firmware_version,
    coalesce(heartbeat_storage_status, '{}'::jsonb), heartbeat_last_error,
    heartbeat_reported_at
  ) returning * into heartbeat_row;

  update public.devices set
    last_seen_at = heartbeat_row.received_at,
    firmware_version = heartbeat_firmware_version
  where id = device_row.id;
  update public.device_credentials set last_used_at = heartbeat_row.received_at
  where device_id = device_row.id
    and secret_hash = encode(digest(device_secret, 'sha256'), 'hex');
  return heartbeat_row;
end;
$$;

create function public.get_device_config(target_device_id uuid, device_secret text)
returns table (
  device_id uuid,
  school_id uuid,
  device_code varchar,
  device_type public.device_type,
  config jsonb,
  update_channel varchar,
  firmware_version varchar
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select d.id, d.school_id, d.device_code, d.device_type, d.config,
    d.update_channel, d.firmware_version
  from public.devices d
  join public.device_credentials dc on dc.device_id = d.id and dc.school_id = d.school_id
  where d.id = target_device_id
    and d.status = 'ACTIVE'
    and d.deleted_at is null
    and dc.secret_hash = encode(digest(device_secret, 'sha256'), 'hex')
    and dc.revoked_at is null
    and (dc.expires_at is null or dc.expires_at > now());
  if not found then
    raise exception 'invalid device credential' using errcode = '28000';
  end if;
end;
$$;

revoke all on function public.switch_academic_year(uuid, uuid) from public;
revoke all on function public.record_student_class_history(uuid, uuid, uuid, uuid, date) from public;
revoke all on function public.register_device(uuid, text, public.device_type, text, text, text, text, text, jsonb, text) from public;
revoke all on function public.record_device_heartbeat(uuid, text, bigint, smallint, text, jsonb, text, timestamptz) from public;
revoke all on function public.get_device_config(uuid, text) from public;
grant execute on function public.switch_academic_year(uuid, uuid) to authenticated;
grant execute on function public.record_student_class_history(uuid, uuid, uuid, uuid, date) to authenticated;
grant execute on function public.register_device(uuid, text, public.device_type, text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.record_device_heartbeat(uuid, text, bigint, smallint, text, jsonb, text, timestamptz) to anon;
grant execute on function public.get_device_config(uuid, text) to anon;

comment on column public.device_credentials.secret_hash is 'SHA-256 hash of a random 256-bit device token; plaintext is returned once at registration.';
comment on function public.record_device_heartbeat(uuid, text, bigint, smallint, text, jsonb, text, timestamptz) is 'Authenticates a device token and records telemetry atomically.';

commit;
