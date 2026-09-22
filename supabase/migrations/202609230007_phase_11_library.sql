begin;

create type public.library_visit_source as enum ('REALTIME', 'OFFLINE_SYNC');

create table public.library_visits (
  id uuid primary key default gen_random_uuid(), event_id uuid not null,
  school_id uuid not null references public.schools(id), device_id uuid not null,
  student_id uuid not null, class_id uuid, occurred_at timestamptz not null,
  received_at timestamptz not null default now(), local_sequence bigint not null,
  source public.library_visit_source not null, metadata jsonb not null default '{}'::jsonb,
  unique (school_id, event_id), unique (school_id, device_id, local_sequence),
  unique (school_id, id),
  foreign key (school_id, device_id) references public.devices(school_id, id),
  foreign key (school_id, student_id) references public.students(school_id, id),
  foreign key (school_id, class_id) references public.classes(school_id, id),
  check (local_sequence >= 0 and jsonb_typeof(metadata) = 'object')
);
create table public.library_events (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  event_type varchar(80) not null, aggregate_id uuid not null, payload jsonb not null,
  occurred_at timestamptz not null default now(), published_at timestamptz
);
create index library_visits_school_time_idx on public.library_visits(school_id, occurred_at desc);
create index library_visits_class_time_idx on public.library_visits(school_id, class_id, occurred_at desc);
create index library_events_pending_idx on public.library_events(occurred_at) where published_at is null;

alter table public.library_visits enable row level security; alter table public.library_visits force row level security;
alter table public.library_events enable row level security; alter table public.library_events force row level security;
create policy library_visits_read on public.library_visits for select to authenticated
using (public.has_school_permission(school_id, 'library.read'));
create policy library_events_read on public.library_events for select to authenticated
using (public.has_school_permission(school_id, 'library.read'));
grant select on public.library_visits, public.library_events to authenticated;

create function public.ingest_library_visit(
  target_device_id uuid, device_secret text, visit_event_id uuid, visit_card_uid text,
  visit_occurred_at timestamptz, visit_local_sequence bigint,
  visit_source public.library_visit_source default 'REALTIME', visit_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare device_row public.devices; card_row public.student_cards; visit_row public.library_visits; class_row_id uuid;
begin
  if visit_local_sequence < 0 or visit_occurred_at > now() + interval '10 minutes' then
    raise exception 'invalid event clock or sequence' using errcode = 'AG007';
  end if;
  select d into device_row from public.devices d join public.device_credentials dc
    on dc.device_id=d.id and dc.school_id=d.school_id
    where d.id=target_device_id and d.device_type='LIBRARY' and d.status='ACTIVE' and d.deleted_at is null
      and dc.secret_hash=encode(digest(device_secret,'sha256'),'hex') and dc.revoked_at is null
      and (dc.expires_at is null or dc.expires_at>now()) limit 1;
  if not found then raise exception 'invalid library device credential' using errcode='28000'; end if;
  select * into visit_row from public.library_visits where school_id=device_row.school_id and event_id=visit_event_id;
  if found then return jsonb_build_object('id',visit_row.id,'event_id',visit_row.event_id,'student_id',visit_row.student_id,'duplicate',true); end if;
  select * into card_row from public.student_cards where school_id=device_row.school_id and upper(card_uid)=upper(visit_card_uid)
    and status='ACTIVE' and (expires_at is null or expires_at>visit_occurred_at) limit 1;
  if not found then raise exception 'card not found or inactive' using errcode='AG004'; end if;
  select class_id into class_row_id from public.student_class_history where school_id=device_row.school_id
    and student_id=card_row.student_id and is_current order by start_date desc limit 1;
  insert into public.library_visits(event_id,school_id,device_id,student_id,class_id,occurred_at,local_sequence,source,metadata)
    values(visit_event_id,device_row.school_id,device_row.id,card_row.student_id,class_row_id,visit_occurred_at,visit_local_sequence,visit_source,visit_metadata)
    returning * into visit_row;
  insert into public.library_events(school_id,event_type,aggregate_id,payload)
    values(device_row.school_id,'library.visit.created',visit_row.id,to_jsonb(visit_row));
  update public.device_credentials set last_used_at=now() where device_id=device_row.id
    and secret_hash=encode(digest(device_secret,'sha256'),'hex');
  return jsonb_build_object('id',visit_row.id,'event_id',visit_row.event_id,'student_id',visit_row.student_id,'class_id',visit_row.class_id,'duplicate',false);
end $$;

create function public.sync_library_visits(target_device_id uuid, device_secret text, visit_events jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb; results jsonb := '[]'::jsonb; result jsonb;
begin
  if jsonb_typeof(visit_events)<>'array' or jsonb_array_length(visit_events) not between 1 and 500 then
    raise exception 'visit_events must contain 1..500 items' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(visit_events) order by (value->>'local_sequence')::bigint loop
    result := public.ingest_library_visit(target_device_id,device_secret,(item->>'event_id')::uuid,item->>'card_uid',
      (item->>'occurred_at')::timestamptz,(item->>'local_sequence')::bigint,'OFFLINE_SYNC',coalesce(item->'metadata','{}'::jsonb));
    results := results || jsonb_build_array(result);
  end loop;
  return jsonb_build_object('results',results,'processed',jsonb_array_length(results));
end $$;
revoke all on function public.ingest_library_visit(uuid,text,uuid,text,timestamptz,bigint,public.library_visit_source,jsonb) from public,authenticated;
revoke all on function public.sync_library_visits(uuid,text,jsonb) from public,authenticated;
grant execute on function public.ingest_library_visit(uuid,text,uuid,text,timestamptz,bigint,public.library_visit_source,jsonb) to anon;
grant execute on function public.sync_library_visits(uuid,text,jsonb) to anon;
commit;
