-- Migration: Clean cancelled batches, add CASCADE to card_print_events, and purge ghost batch records on CANCEL action
begin;

-- 1. Add ON DELETE CASCADE to card_print_events -> card_batches foreign key constraint
alter table public.card_print_events 
drop constraint if exists card_print_events_school_id_batch_id_fkey;

alter table public.card_print_events 
add constraint card_print_events_school_id_batch_id_fkey 
  foreign key (school_id, batch_id) 
  references public.card_batches(school_id, id) 
  on delete cascade;

-- 2. Update card_batch_action RPC to purge cards and batch records when CANCEL action is performed
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
    
    -- Insert audit log before deletion
    insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,after_data) 
    values(b.school_id,auth.uid(),'CARD_BATCH_CANCELLED','card_batches',b.id,jsonb_build_object('event_id',p_event,'reason',p_reason));

    -- Purge draft/cancelled cards and batch record to avoid UI clutter & redundancy
    delete from public.student_cards where batch_id=b.id and production_status in ('DRAFT', 'PRINTED', 'CANCELLED');
    delete from public.card_batches where id=b.id;
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

-- 3. Clean up existing cancelled student_cards and card_batches from database
delete from public.student_cards where production_status = 'CANCELLED';

delete from public.card_batches cb 
where not exists (
  select 1 from public.student_cards sc 
  where sc.batch_id = cb.id 
    and sc.production_status in ('DRAFT', 'PRINTED', 'READY_TO_WRITE', 'WRITING', 'VERIFIED', 'FAILED')
);

notify pgrst, 'reload schema';
commit;
