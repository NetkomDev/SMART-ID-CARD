begin;
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),actor_user_id uuid references public.users(id),
 action varchar(120) not null,resource_type varchar(80) not null,resource_id uuid,request_id uuid,route text,http_status smallint,
 before_data jsonb,after_data jsonb,metadata jsonb not null default '{}'::jsonb,occurred_at timestamptz not null default now(),
 check(btrim(action)<>'' and btrim(resource_type)<>''),check(metadata is not null and jsonb_typeof(metadata)='object'),check(http_status is null or http_status between 100 and 599)
);
create table public.data_retention_policies (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),data_category varchar(80) not null,
 retention_days integer not null,legal_basis text not null,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(school_id,data_category),check(retention_days between 30 and 3650),check(btrim(legal_basis)<>'')
);
create index audit_logs_school_time_idx on public.audit_logs(school_id,occurred_at desc);
create index audit_logs_resource_idx on public.audit_logs(school_id,resource_type,resource_id,occurred_at desc);
create trigger retention_policy_updated_at before update on public.data_retention_policies for each row execute function public.set_updated_at();
create function public.reject_audit_log_mutation() returns trigger language plpgsql as $$begin raise exception 'audit logs are append-only' using errcode='55000';end$$;
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.reject_audit_log_mutation();
alter table public.audit_logs enable row level security;alter table public.audit_logs force row level security;
alter table public.data_retention_policies enable row level security;alter table public.data_retention_policies force row level security;
create policy audit_logs_read on public.audit_logs for select to authenticated using(public.has_school_permission(school_id,'audit.read'));
create policy retention_read on public.data_retention_policies for select to authenticated using(public.has_school_permission(school_id,'privacy.manage'));
create policy retention_manage on public.data_retention_policies for all to authenticated using(public.has_school_permission(school_id,'privacy.manage')) with check(public.has_school_permission(school_id,'privacy.manage'));
grant select on public.audit_logs to authenticated;grant select,insert,update,delete on public.data_retention_policies to authenticated;
create function public.append_audit_log(target_school_id uuid,p_action text,p_resource_type text,p_resource_id uuid,p_request_id uuid,p_route text,p_http_status integer,p_before_data jsonb default null,p_after_data jsonb default null,p_metadata jsonb default '{}'::jsonb)returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$declare result uuid;begin
 if not public.has_school_access(target_school_id) then raise exception 'audit tenant access denied' using errcode='42501';end if;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,request_id,route,http_status,before_data,after_data,metadata)
 values(target_school_id,auth.uid(),p_action,p_resource_type,p_resource_id,p_request_id,p_route,p_http_status,p_before_data,p_after_data,coalesce(p_metadata,'{}')) returning id into result;return result;end$$;
revoke all on function public.append_audit_log(uuid,text,text,uuid,uuid,text,integer,jsonb,jsonb,jsonb) from public;
grant execute on function public.append_audit_log(uuid,text,text,uuid,uuid,text,integer,jsonb,jsonb,jsonb) to authenticated;
comment on table public.audit_logs is 'Append-only privileged action trail. Retention is governed per tenant and deletions require an approved service-role retention job.';
comment on table public.data_retention_policies is 'Tenant data-retention configuration; production deletion jobs must preserve legal holds and audit evidence.';
commit;
