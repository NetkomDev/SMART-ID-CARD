begin;
-- Device row expansion fixes the composite-to-UUID cast exposed by integration tests.
create or replace function public.ingest_library_visit(
  target_device_id uuid, device_secret text, visit_event_id uuid, visit_card_uid text,
  visit_occurred_at timestamptz, visit_local_sequence bigint,
  visit_source public.library_visit_source default 'REALTIME', visit_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare device_row public.devices; card_row public.student_cards; visit_row public.library_visits; class_row_id uuid;
begin
  if visit_local_sequence < 0 or visit_occurred_at > now() + interval '10 minutes' then
    raise exception 'invalid event clock or sequence' using errcode = 'AG007';
  end if;
  select d.* into device_row from public.devices d join public.device_credentials dc
    on dc.device_id=d.id and dc.school_id=d.school_id
    where d.id=target_device_id and d.device_type='LIBRARY' and d.status='ACTIVE' and d.deleted_at is null
      and dc.secret_hash=encode(digest(device_secret,'sha256'),'hex') and dc.revoked_at is null
      and (dc.expires_at is null or dc.expires_at>now()) limit 1;
  if not found then raise exception 'invalid library device credential' using errcode='28000'; end if;
  if not exists(select 1 from public.schools where id=device_row.school_id and status='ACTIVE' and is_active and deleted_at is null) then raise exception 'School inactive' using errcode='28000';end if;
  perform pg_advisory_xact_lock(hashtextextended(device_row.school_id::text||visit_event_id::text,0));
  select * into visit_row from public.library_visits where school_id=device_row.school_id and event_id=visit_event_id;
  if found then return jsonb_build_object('id',visit_row.id,'event_id',visit_row.event_id,'student_id',visit_row.student_id,'duplicate',true); end if;
  select * into card_row from public.student_cards where school_id=device_row.school_id and (upper(card_uid)=upper(visit_card_uid) or qr_key=visit_card_uid)
    and status='ACTIVE' and production_status in ('VERIFIED','LEGACY') and (expires_at is null or expires_at>visit_occurred_at) limit 1;
  if not found then raise exception 'card not found or inactive' using errcode='AG004'; end if;
  if not exists(select 1 from public.students where id=card_row.student_id and school_id=device_row.school_id and is_active and deleted_at is null) then raise exception 'Student inactive' using errcode='AG006';end if;
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

create or replace function public.get_led_gateway_state(target_device_id uuid,device_secret text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices; c public.led_content;
begin
 select dv.* into d from public.devices dv join public.device_credentials dc on dc.device_id=dv.id and dc.school_id=dv.school_id
 where dv.id=target_device_id and dv.device_type='LED' and dv.status='ACTIVE' and dv.deleted_at is null
 and dc.secret_hash=encode(digest(device_secret,'sha256'),'hex') and dc.revoked_at is null and (dc.expires_at is null or dc.expires_at>now()) limit 1;
 if not found then raise exception 'invalid led credential' using errcode='28000'; end if;
 select * into c from public.led_content where school_id=d.school_id and is_active and starts_at<=now() and (ends_at is null or ends_at>now())
 order by case priority when 'EMERGENCY' then 5 when 'ADMIN_OVERRIDE' then 4 when 'ACHIEVEMENT' then 3 when 'NORMAL_DASHBOARD' then 2 else 1 end desc, starts_at desc limit 1;
 update public.device_credentials set last_used_at=now() where device_id=d.id and secret_hash=encode(digest(device_secret,'sha256'),'hex');
 if c.id is null then return jsonb_build_object('mode','FALLBACK','content',null,'server_time',now()); end if;
 return jsonb_build_object('mode','LIVE','server_time',now(),'content',jsonb_build_object('id',c.id,'priority',c.priority,'title',c.title,'body',c.body,'version',c.version,'ends_at',c.ends_at));
end $$;
commit;
