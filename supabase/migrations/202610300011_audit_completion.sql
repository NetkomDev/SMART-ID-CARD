begin;
create table public.platform_audit_events(id uuid primary key default gen_random_uuid(),actor_id uuid references public.users(id),action text not null,resource_id uuid,occurred_at timestamptz not null default now());
alter table public.platform_audit_events enable row level security;
revoke all on public.platform_audit_events from public,anon,authenticated;
grant select on public.platform_audit_events to authenticated;
create policy platform_audit_read on public.platform_audit_events for select to authenticated using(public.is_platform_admin());
create trigger platform_audit_immutable before update or delete on public.platform_audit_events for each row execute function public.reject_audit_log_mutation();
create function public.save_platform_card_template(p_level text,p_side text,p_url text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result uuid;
begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501'; end if;
 if length(p_url)>4000000 or p_url !~ '^(https://|data:image/(png|jpeg);base64,)' then raise exception 'Invalid template image' using errcode='22023'; end if;
 insert into public.card_templates(level,side,template_url) values(p_level,p_side,p_url) on conflict(level,side) do update set template_url=excluded.template_url,updated_at=now() returning id into result;
 insert into public.platform_audit_events(actor_id,action,resource_id) values(auth.uid(),'card.template.saved',result);
 return result;
end $$;
revoke all on function public.save_platform_card_template(text,text,text) from public,anon;
grant execute on function public.save_platform_card_template(text,text,text) to authenticated;
do $$ declare t text; begin
 foreach t in array array['students','classes','academic_years','student_class_history','roles','permissions','role_permissions','led_content','extracurriculars','extracurricular_sessions','extracurricular_members'] loop
 execute format('create trigger durable_audit after insert or update or delete on public.%I for each row execute function public.audit_sensitive_mutation()',t);
 end loop;
end $$;
commit;
