begin;
create table public.external_operations(
 id uuid primary key, actor_id uuid not null references public.users(id),school_id uuid not null references public.schools(id),
 target_user_id uuid not null references public.users(id),action text not null,status text not null default 'PENDING',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(status in ('PENDING','SUCCEEDED','FAILED','UNKNOWN'))
);
alter table public.external_operations enable row level security;
revoke all on public.external_operations from public,anon,authenticated;
grant select on public.external_operations to authenticated;
create policy operations_platform_read on public.external_operations for select to authenticated using(public.is_platform_admin());
create function public.begin_password_recovery(p_id uuid,p_school uuid,p_user uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare op public.external_operations;
begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 300 then raise exception 'Reason required' using errcode='22023'; end if;
 if not exists(select 1 from public.school_users where school_id=p_school and user_id=p_user and status='ACTIVE' and deleted_at is null)
 then raise exception 'Active target not found' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended('recovery:'||p_user::text,0));
 select * into op from public.external_operations where id=p_id;
 if found then
 if op.actor_id<>auth.uid() or op.school_id<>p_school or op.target_user_id<>p_user then raise exception 'Operation conflict' using errcode='23505'; end if;
 return jsonb_build_object('execute',false,'status',op.status);
 end if;
 if exists(select 1 from public.external_operations where target_user_id=p_user and (status in ('PENDING','UNKNOWN') or created_at>now()-interval '15 minutes'))
 then raise exception 'Recovery cooldown active' using errcode='22023'; end if;
 insert into public.external_operations(id,actor_id,school_id,target_user_id,action) values(p_id,auth.uid(),p_school,p_user,'auth.password.recovery');
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,request_id,metadata)
 values(p_school,auth.uid(),'auth.password.recovery.requested','user',p_user,p_id,jsonb_build_object('reason',p_reason));
 return jsonb_build_object('execute',true,'status','PENDING');
end $$;
create function public.finish_password_recovery(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare op public.external_operations;
begin
 if not public.is_platform_admin() or p_status not in ('SUCCEEDED','FAILED','UNKNOWN') then raise exception 'Operation denied' using errcode='42501'; end if;
 select * into op from public.external_operations where id=p_id and actor_id=auth.uid() for update;
 if not found then raise exception 'Operation not found' using errcode='P0002'; end if;
 if op.status<>'PENDING' then return; end if;
 update public.external_operations set status=p_status,updated_at=now() where id=p_id;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,request_id,metadata)
 values(op.school_id,auth.uid(),'auth.password.recovery.finished','user',op.target_user_id,p_id,jsonb_build_object('status',p_status));
end $$;
revoke all on function public.begin_password_recovery(uuid,uuid,uuid,text),public.finish_password_recovery(uuid,text) from public,anon;
grant execute on function public.begin_password_recovery(uuid,uuid,uuid,text),public.finish_password_recovery(uuid,text) to authenticated;
-- Transactional database audit covers direct REST, service-role and RPC mutations.
create function public.audit_sensitive_mutation() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare row_data jsonb; sid uuid; rid uuid; actor uuid;
begin
 if TG_OP='DELETE' then row_data:=to_jsonb(OLD); else row_data:=to_jsonb(NEW); end if;
 sid:=nullif(row_data->>'school_id','')::uuid;
 if TG_TABLE_NAME='schools' then sid:=(row_data->>'id')::uuid; end if;
 rid:=nullif(row_data->>'id','')::uuid;
 select id into actor from public.users where id=auth.uid();
 if sid is not null then
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(sid,actor,lower(TG_OP)||'.'||TG_TABLE_NAME,TG_TABLE_NAME,rid,jsonb_build_object('source','database_trigger','fields',case when TG_OP='UPDATE' then
 (select coalesce(jsonb_agg(n.key),'[]') from jsonb_each(to_jsonb(NEW)) n where n.value is distinct from to_jsonb(OLD)->n.key) else '[]'::jsonb end));
 end if;
 return null;
end $$;
revoke all on function public.audit_sensitive_mutation() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['schools','school_users','school_user_roles','devices','student_cards','card_batches','card_write_jobs','parent_student_links','parent_link_tokens','student_absence_permits','qr_access_tokens','card_templates'] loop
 -- Global templates have no school FK; application-level coverage tracked separately.
 if t<>'card_templates' then execute format('create trigger durable_audit after insert or update or delete on public.%I for each row execute function public.audit_sensitive_mutation()',t); end if;
 end loop;
end $$;
commit;
