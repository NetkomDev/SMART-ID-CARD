begin;

-- 1. Reset stuck test draft cards and batch from previous test runs so students return to candidate queue
update public.student_cards 
set production_status = 'CANCELLED' 
where production_status in ('DRAFT', 'PRINTED') 
  and card_uid is null;

-- 2. Update create_card_batch RPC to strictly disallow students without photos
create or replace function public.create_card_batch(
  p_id uuid,
  p_school uuid,
  p_students uuid[],
  p_class uuid default null,
  p_replaces uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare 
  s public.students;
  c public.classes;
  school public.schools;
  old_card public.student_cards;
  cid uuid;
  existing public.card_batches;
begin
  if not public.is_platform_admin() then 
    raise exception 'Platform authority required' using errcode='42501';
  end if;

  if p_students is null or cardinality(p_students) not between 1 and 200 or cardinality(p_students)<>(select count(distinct x) from unnest(p_students) x) then 
    raise exception 'Select 1 to 200 distinct students';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production:'||p_school::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));

  select * into existing from public.card_batches where id=p_id;
  if found then
    if existing.school_id<>p_school or existing.created_by<>auth.uid() or existing.class_id is distinct from p_class or (select array_agg(student_id order by student_id) from public.student_cards where batch_id=p_id) is distinct from (select array_agg(x order by x) from unnest(p_students)x) or exists(select 1 from public.student_cards where batch_id=p_id and replaces_card_id is distinct from p_replaces) then 
      raise exception 'Batch idempotency conflict';
    end if;
    return p_id;
  end if;

  select * into school from public.schools where id=p_school and is_active and status='ACTIVE' and deleted_at is null for update;
  if not found then 
    raise exception 'School is inactive';
  end if;

  if p_class is not null then 
    select * into c from public.classes where id=p_class and school_id=p_school and is_active and deleted_at is null;
    if not found then 
      raise exception 'Invalid class';
    end if;
  end if;

  if p_replaces is not null then
    select * into old_card from public.student_cards where school_id=p_school and id=p_replaces for update;
    if not found or cardinality(p_students)<>1 or old_card.student_id<>p_students[1] or old_card.production_status not in ('VERIFIED','LEGACY') or old_card.status not in ('LOST','BLOCKED','EXPIRED') then 
      raise exception 'Block or mark the previous card lost before replacing it';
    end if;
  end if;

  insert into public.card_batches(id,school_id,class_id,academic_year_id,created_by) 
  values(p_id,p_school,p_class,c.academic_year_id,auth.uid());

  for s in select * from public.students where school_id=p_school and id=any(p_students) and is_active and deleted_at is null order by id for update loop
    if p_class is not null and not exists(select 1 from public.student_class_history where school_id=p_school and student_id=s.id and class_id=p_class and is_current) then 
      raise exception 'Student is not in selected class';
    end if;

    -- Strict check: Student MUST have a photo uploaded before card batch creation!
    if s.photo_url is null or btrim(s.photo_url) = '' then
      raise exception 'Siswa % belum memiliki foto resmi yang diunggah dari PWA Orang Tua', s.full_name;
    end if;

    if exists(select 1 from public.student_cards where school_id=p_school and student_id=s.id and (status='ACTIVE' or production_status in ('DRAFT','PRINTED','READY_TO_WRITE','WRITING','FAILED'))) then 
      raise exception 'Student already has an active card or unfinished production';
    end if;

    cid:=gen_random_uuid();
    insert into public.student_cards(id,school_id,student_id,card_serial,qr_key,status,revoked_at,production_status,batch_id,replaces_card_id,print_snapshot)
    values(
      cid,p_school,s.id,'AKS-'||upper(replace(cid::text,'-','')),encode(gen_random_bytes(24),'hex'),'BLOCKED',now(),'DRAFT',p_id,p_replaces,
      jsonb_build_object(
        'student_name',s.full_name,
        'student_number',s.student_number,
        'school_name',school.name,
        'school_code',school.code,
        'class_name',coalesce(c.name,(select cl.name from public.student_class_history h join public.classes cl on cl.id=h.class_id where h.school_id=p_school and h.student_id=s.id and h.is_current limit 1)),
        'template_version','aksis-v1'
      )
    );
  end loop;

  if (select count(*) from public.student_cards where batch_id=p_id)<>cardinality(p_students) then 
    raise exception 'Some students are inactive or belong to another school';
  end if;

  insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,after_data) 
  values(p_school,auth.uid(),'CARD_BATCH_CREATED','card_batches',p_id,jsonb_build_object('count',cardinality(p_students),'class_id',p_class));

  return p_id;
end$$;

-- 3. Enhance card_batch_action RPC to support CANCEL action for resetting/cancelling interrupted batches
create or replace function public.card_batch_action(
  p_batch uuid,
  p_event uuid,
  p_action text,
  p_reason text
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare 
  b public.card_batches;
  prior public.card_print_events;
begin
  if not public.is_platform_admin() then 
    raise exception 'Platform authority required' using errcode='42501';
  end if;

  if p_action is null or p_reason is null or p_action not in ('PRINTED','REPRINTED','RELEASED','CANCEL') or length(btrim(p_reason)) not between 3 and 500 then 
    raise exception 'Action and reason required';
  end if;

  select * into b from public.card_batches where id=p_batch;
  if not found then 
    raise exception 'Batch not found' using errcode='P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production:'||b.school_id::text,0));
  select * into b from public.card_batches where id=p_batch for update;

  select * into prior from public.card_print_events where id=p_event;
  if found then 
    if prior.batch_id<>p_batch or prior.kind<>p_action or prior.reason<>p_reason then 
      raise exception 'Event conflict';
    end if;
    return;
  end if;

  perform 1 from public.student_cards where batch_id=b.id order by id for update;

  if p_action = 'CANCEL' then
    if exists(select 1 from public.student_cards where batch_id=b.id and production_status in ('READY_TO_WRITE','WRITING','VERIFIED')) then 
      raise exception 'Batch already released or verified; cannot cancel active production';
    end if;
    update public.student_cards set production_status='CANCELLED' where batch_id=b.id;
    insert into public.card_print_events(id,school_id,batch_id,actor_id,kind,reason) values(p_event,b.school_id,b.id,auth.uid(),'CANCEL',p_reason);
    insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,after_data) values(b.school_id,auth.uid(),'CARD_BATCH_CANCELLED','card_batches',b.id,jsonb_build_object('event_id',p_event,'reason',p_reason));
    return;
  end if;

  if exists(select 1 from public.student_cards where batch_id=b.id and production_status not in ('DRAFT','PRINTED')) then 
    raise exception 'Batch already released; cancel rejected cards before creating replacement production';
  end if;

  if p_action='RELEASED' then
    if exists(select 1 from public.student_cards where batch_id=b.id and production_status<>'PRINTED') then 
      raise exception 'Confirm physical print and QC before release';
    end if;
    update public.student_cards set production_status='READY_TO_WRITE' where batch_id=b.id;
    insert into public.card_write_jobs(school_id,card_id,idempotency_key,created_by) 
    select school_id,id,id,auth.uid() from public.student_cards where batch_id=b.id;
  else 
    update public.student_cards set production_status='PRINTED' where batch_id=b.id;
  end if;

  insert into public.card_print_events(id,school_id,batch_id,actor_id,kind,reason) values(p_event,b.school_id,b.id,auth.uid(),p_action,p_reason);
  insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,after_data) values(b.school_id,auth.uid(),'CARD_BATCH_'||p_action,'card_batches',b.id,jsonb_build_object('event_id',p_event,'reason',p_reason));
end$$;

commit;
