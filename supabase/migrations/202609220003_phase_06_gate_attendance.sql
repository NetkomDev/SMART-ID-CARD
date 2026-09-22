-- AKSIS Phase 06: gate attendance rules, idempotent events, and offline ingestion.
begin;

create type public.gate_mode as enum ('AUTO', 'ENTRY_ONLY', 'EXIT_ONLY');
create type public.attendance_direction as enum ('CHECK_IN', 'CHECK_OUT');
create type public.attendance_source as enum ('REALTIME', 'OFFLINE_SYNC');

create table public.attendance_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  device_id uuid,
  name varchar(120) not null,
  mode public.gate_mode not null default 'AUTO',
  entry_start time,
  on_time_until time,
  checkout_start time,
  duplicate_window_seconds integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint attendance_rules_device_fk foreign key (school_id, device_id)
    references public.devices(school_id, id) on delete cascade,
  constraint attendance_rules_name_not_blank check (btrim(name) <> ''),
  constraint attendance_rules_duplicate_window check (duplicate_window_seconds between 0 and 3600),
  constraint attendance_rules_entry_window check (
    entry_start is null or on_time_until is null or entry_start <= on_time_until
  ),
  constraint attendance_rules_deleted_state check (deleted_at is null or is_active = false)
);

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  school_id uuid not null references public.schools(id) on delete restrict,
  device_id uuid not null,
  student_id uuid not null,
  card_id uuid not null,
  class_id uuid,
  direction public.attendance_direction not null,
  source public.attendance_source not null,
  occurred_at_local timestamptz not null,
  occurred_at_server timestamptz not null default now(),
  local_sequence bigint not null,
  is_late boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint attendance_logs_device_fk foreign key (school_id, device_id)
    references public.devices(school_id, id) on delete restrict,
  constraint attendance_logs_student_fk foreign key (school_id, student_id)
    references public.students(school_id, id) on delete restrict,
  constraint attendance_logs_card_fk foreign key (school_id, card_id)
    references public.student_cards(school_id, id) on delete restrict,
  constraint attendance_logs_class_fk foreign key (school_id, class_id)
    references public.classes(school_id, id) on delete restrict,
  constraint attendance_logs_event_key unique (school_id, event_id),
  constraint attendance_logs_sequence_nonnegative check (local_sequence >= 0),
  constraint attendance_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.attendance_event_receipts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  school_id uuid not null references public.schools(id) on delete restrict,
  device_id uuid not null,
  attendance_id uuid references public.attendance_logs(id) on delete restrict,
  source public.attendance_source not null,
  result jsonb not null,
  received_at timestamptz not null default now(),
  constraint attendance_event_receipts_device_fk foreign key (school_id, device_id)
    references public.devices(school_id, id) on delete restrict,
  constraint attendance_event_receipts_event_key unique (school_id, event_id),
  constraint attendance_event_receipts_result_object check (jsonb_typeof(result) = 'object')
);

create unique index attendance_rules_one_device_active
  on public.attendance_rules (school_id, device_id)
  where device_id is not null and is_active and deleted_at is null;
create unique index attendance_rules_one_school_default
  on public.attendance_rules (school_id)
  where device_id is null and is_active and deleted_at is null;
create unique index student_cards_uid_case_insensitive
  on public.student_cards (school_id, upper(card_uid));
create index attendance_logs_student_time_idx
  on public.attendance_logs (school_id, student_id, occurred_at_local desc);
create index attendance_logs_device_time_idx
  on public.attendance_logs (school_id, device_id, occurred_at_server desc);
create index attendance_logs_class_time_idx
  on public.attendance_logs (school_id, class_id, occurred_at_local desc)
  where class_id is not null;
create index attendance_event_receipts_device_time_idx
  on public.attendance_event_receipts (school_id, device_id, received_at desc);

create trigger attendance_rules_set_updated_at before update on public.attendance_rules
for each row execute function public.set_updated_at();

alter table public.attendance_rules enable row level security;
alter table public.attendance_rules force row level security;
alter table public.attendance_logs enable row level security;
alter table public.attendance_logs force row level security;
alter table public.attendance_event_receipts enable row level security;
alter table public.attendance_event_receipts force row level security;

create policy attendance_rules_select on public.attendance_rules for select to authenticated
  using (public.has_school_permission(school_id, 'device.read'));
create policy attendance_rules_manage on public.attendance_rules for all to authenticated
  using (public.has_school_permission(school_id, 'attendance.manage'))
  with check (public.has_school_permission(school_id, 'attendance.manage'));
create policy attendance_logs_select on public.attendance_logs for select to authenticated
  using (public.has_school_permission(school_id, 'attendance.read'));
create policy attendance_event_receipts_select on public.attendance_event_receipts for select to authenticated
  using (public.has_school_permission(school_id, 'attendance.read'));

grant select, insert, update, delete on public.attendance_rules to authenticated;
grant select on public.attendance_logs to authenticated;
grant select on public.attendance_event_receipts to authenticated;

create function public.ingest_gate_attendance(
  target_device_id uuid,
  device_secret text,
  attendance_event_id uuid,
  attendance_card_uid text,
  attendance_occurred_at timestamptz,
  attendance_local_sequence bigint,
  attendance_source public.attendance_source,
  attendance_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  device_row public.devices;
  school_timezone text;
  card_row public.student_cards;
  student_row public.students;
  class_row_id uuid;
  rule_row public.attendance_rules;
  last_row public.attendance_logs;
  inserted_row public.attendance_logs;
  receipt_row public.attendance_event_receipts;
  local_time time;
  local_day date;
  selected_direction public.attendance_direction;
  late boolean := false;
  response_payload jsonb;
begin
  if attendance_local_sequence < 0 or attendance_occurred_at > now() + interval '10 minutes' then
    raise exception 'invalid event clock or sequence' using errcode = 'AG007';
  end if;

  select d, s.timezone into device_row, school_timezone
  from public.devices d
  join public.schools s on s.id = d.school_id
  join public.device_credentials dc on dc.device_id = d.id and dc.school_id = d.school_id
  where d.id = target_device_id
    and d.status = 'ACTIVE'
    and d.deleted_at is null
    and s.status = 'ACTIVE' and s.is_active and s.deleted_at is null
    and dc.secret_hash = encode(digest(device_secret, 'sha256'), 'hex')
    and dc.revoked_at is null
    and (dc.expires_at is null or dc.expires_at > now())
  limit 1;
  if not found then
    raise exception 'invalid device credential' using errcode = '28000';
  end if;
  if device_row.device_type <> 'GATE' then
    raise exception 'device is not a gate' using errcode = 'AG002';
  end if;
  if device_row.config -> 'attendance_enabled' = 'false'::jsonb then
    raise exception 'gate attendance is disabled' using errcode = 'AG003';
  end if;

  select * into receipt_row from public.attendance_event_receipts
  where school_id = device_row.school_id and event_id = attendance_event_id;
  if found then
    return receipt_row.result || jsonb_build_object('duplicate', true, 'duplicate_reason', 'EVENT_ID');
  end if;

  select * into card_row from public.student_cards
  where school_id = device_row.school_id and upper(card_uid) = upper(attendance_card_uid)
  limit 1;
  if not found then
    raise exception 'card not found' using errcode = 'AG004';
  end if;
  if card_row.status <> 'ACTIVE'
     or (card_row.expires_at is not null and card_row.expires_at <= attendance_occurred_at) then
    raise exception 'card is not active' using errcode = 'AG005';
  end if;

  select * into student_row from public.students
  where school_id = device_row.school_id and id = card_row.student_id;
  if not found or not student_row.is_active or student_row.deleted_at is not null then
    raise exception 'student is inactive' using errcode = 'AG006';
  end if;

  select sch.class_id into class_row_id
  from public.student_class_history sch
  where sch.school_id = device_row.school_id
    and sch.student_id = student_row.id and sch.is_current
  limit 1;

  select * into rule_row from public.attendance_rules ar
  where ar.school_id = device_row.school_id
    and (ar.device_id = device_row.id or ar.device_id is null)
    and ar.is_active and ar.deleted_at is null
  order by (ar.device_id is not null) desc
  limit 1;
  if not found then
    rule_row.mode := 'AUTO';
    rule_row.duplicate_window_seconds := 30;
  end if;

  local_time := attendance_occurred_at at time zone school_timezone;
  local_day := (attendance_occurred_at at time zone school_timezone)::date;

  -- Serialize decisions for the same student and local day. This prevents two
  -- simultaneous readers from both deciding that a scan is CHECK_IN.
  perform pg_advisory_xact_lock(hashtextextended(
    device_row.school_id::text || ':' || student_row.id::text || ':' || local_day::text, 0
  ));

  -- A concurrent request with the same event may have completed while this
  -- transaction was waiting for the student/day lock.
  select * into receipt_row from public.attendance_event_receipts
  where school_id = device_row.school_id and event_id = attendance_event_id;
  if found then
    return receipt_row.result || jsonb_build_object('duplicate', true, 'duplicate_reason', 'EVENT_ID');
  end if;

  select * into last_row from public.attendance_logs al
  where al.school_id = device_row.school_id and al.student_id = student_row.id
    and (al.occurred_at_local at time zone school_timezone)::date = local_day
  order by al.occurred_at_local desc, al.created_at desc
  limit 1;

  if found
      and attendance_occurred_at >= last_row.occurred_at_local
        - make_interval(secs => rule_row.duplicate_window_seconds)
      and attendance_occurred_at <= last_row.occurred_at_local
        + make_interval(secs => rule_row.duplicate_window_seconds) then
    response_payload := jsonb_build_object(
      'event_id', attendance_event_id,
      'attendance_id', last_row.id,
      'direction', last_row.direction,
      'student_id', last_row.student_id,
      'is_late', last_row.is_late,
      'duplicate', true,
      'duplicate_reason', 'SCAN_WINDOW',
      'occurred_at_server', last_row.occurred_at_server
    );
    insert into public.attendance_event_receipts (
      event_id, school_id, device_id, attendance_id, source, result
    ) values (
      attendance_event_id, device_row.school_id, device_row.id, last_row.id,
      attendance_source, response_payload
    );
    return response_payload;
  end if;

  if last_row.id is not null and (
      (rule_row.mode = 'ENTRY_ONLY' and last_row.direction = 'CHECK_IN')
      or (rule_row.mode = 'EXIT_ONLY' and last_row.direction = 'CHECK_OUT')
    ) then
    response_payload := jsonb_build_object(
      'event_id', attendance_event_id,
      'attendance_id', last_row.id,
      'direction', last_row.direction,
      'student_id', last_row.student_id,
      'is_late', last_row.is_late,
      'duplicate', true,
      'duplicate_reason', 'ATTENDANCE_STATE',
      'occurred_at_server', last_row.occurred_at_server
    );
    insert into public.attendance_event_receipts (
      event_id, school_id, device_id, attendance_id, source, result
    ) values (
      attendance_event_id, device_row.school_id, device_row.id, last_row.id,
      attendance_source, response_payload
    );
    return response_payload;
  elsif rule_row.mode = 'ENTRY_ONLY' then
    selected_direction := 'CHECK_IN';
  elsif rule_row.mode = 'EXIT_ONLY' then
    selected_direction := 'CHECK_OUT';
  elsif last_row.id is null then
    selected_direction := 'CHECK_IN';
  elsif last_row.direction = 'CHECK_IN'
      and (rule_row.checkout_start is null or local_time >= rule_row.checkout_start) then
    selected_direction := 'CHECK_OUT';
  else
    response_payload := jsonb_build_object(
      'event_id', attendance_event_id,
      'attendance_id', last_row.id,
      'direction', last_row.direction,
      'student_id', last_row.student_id,
      'is_late', last_row.is_late,
      'duplicate', true,
      'duplicate_reason', 'ATTENDANCE_STATE',
      'occurred_at_server', last_row.occurred_at_server
    );
    insert into public.attendance_event_receipts (
      event_id, school_id, device_id, attendance_id, source, result
    ) values (
      attendance_event_id, device_row.school_id, device_row.id, last_row.id,
      attendance_source, response_payload
    );
    return response_payload;
  end if;

  if selected_direction = 'CHECK_IN'
      and rule_row.entry_start is not null and local_time < rule_row.entry_start then
    raise exception 'entry window has not started' using errcode = 'AG007';
  end if;
  late := selected_direction = 'CHECK_IN'
    and rule_row.on_time_until is not null and local_time > rule_row.on_time_until;

  insert into public.attendance_logs (
    event_id, school_id, device_id, student_id, card_id, class_id, direction,
    source, occurred_at_local, local_sequence, is_late, metadata
  ) values (
    attendance_event_id, device_row.school_id, device_row.id, student_row.id,
    card_row.id, class_row_id, selected_direction, attendance_source,
    attendance_occurred_at, attendance_local_sequence, late,
    coalesce(attendance_metadata, '{}'::jsonb)
  ) returning * into inserted_row;

  update public.device_credentials set last_used_at = now()
  where device_id = device_row.id
    and secret_hash = encode(digest(device_secret, 'sha256'), 'hex');
  update public.devices set last_seen_at = now() where id = device_row.id;

  response_payload := jsonb_build_object(
    'event_id', inserted_row.event_id,
    'attendance_id', inserted_row.id,
    'direction', inserted_row.direction,
    'student_id', student_row.id,
    'student_name', student_row.full_name,
    'class_id', class_row_id,
    'is_late', inserted_row.is_late,
    'duplicate', false,
    'occurred_at_server', inserted_row.occurred_at_server
  );
  insert into public.attendance_event_receipts (
    event_id, school_id, device_id, attendance_id, source, result
  ) values (
    attendance_event_id, device_row.school_id, device_row.id, inserted_row.id,
    attendance_source, response_payload
  );
  return response_payload;
end;
$$;

create function public.sync_gate_attendance_batch(
  target_device_id uuid,
  device_secret text,
  attendance_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  item_result jsonb;
  results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(attendance_events) <> 'array'
      or jsonb_array_length(attendance_events) = 0
      or jsonb_array_length(attendance_events) > 500 then
    raise exception 'batch must contain 1 to 500 events' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(attendance_events)
  loop
    begin
      item_result := public.ingest_gate_attendance(
        target_device_id,
        device_secret,
        (item ->> 'event_id')::uuid,
        item ->> 'card_uid',
        (item ->> 'occurred_at')::timestamptz,
        (item ->> 'local_sequence')::bigint,
        'OFFLINE_SYNC',
        coalesce(item -> 'metadata', '{}'::jsonb)
      );
      results := results || jsonb_build_array(
        jsonb_build_object('success', true, 'event_id', item ->> 'event_id', 'result', item_result)
      );
    exception when others then
      -- Authentication/device-mode failures invalidate the whole request and
      -- must not be disguised as per-item acknowledgements.
      if sqlstate in ('28000', 'AG002', 'AG003') then
        raise;
      end if;
      results := results || jsonb_build_array(jsonb_build_object(
        'success', false,
        'event_id', item ->> 'event_id',
        'error_code', case sqlstate
          when 'AG004' then 'CARD_NOT_FOUND'
          when 'AG005' then 'CARD_BLOCKED'
          when 'AG006' then 'STUDENT_INACTIVE'
          when 'AG007' then 'GATE_RULE_VIOLATION'
          when '23503' then 'VALIDATION_ERROR'
          when '23514' then 'VALIDATION_ERROR'
          else 'SERVER_UNAVAILABLE'
        end,
        'message', case
          when sqlstate in ('AG004', 'AG005', 'AG006', 'AG007') then sqlerrm
          else 'event could not be processed'
        end
      ));
    end;
  end loop;
  return jsonb_build_object('results', results, 'processed', jsonb_array_length(results));
end;
$$;

revoke all on function public.ingest_gate_attendance(uuid, text, uuid, text, timestamptz, bigint, public.attendance_source, jsonb) from public;
revoke all on function public.sync_gate_attendance_batch(uuid, text, jsonb) from public;
grant execute on function public.ingest_gate_attendance(uuid, text, uuid, text, timestamptz, bigint, public.attendance_source, jsonb) to anon;
grant execute on function public.sync_gate_attendance_batch(uuid, text, jsonb) to anon;

comment on table public.attendance_logs is 'Immutable tenant-scoped gate events; event_id provides offline idempotency.';
comment on function public.sync_gate_attendance_batch(uuid, text, jsonb) is 'Processes up to 500 offline events with a per-event acknowledgement.';

commit;
