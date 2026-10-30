begin;
create table public.parent_revoked_sessions(session_id uuid primary key,user_id uuid not null references auth.users(id),revoked_at timestamptz not null default now());
alter table public.parent_revoked_sessions enable row level security;
revoke all on public.parent_revoked_sessions from public,anon,authenticated;
create or replace function public.is_individual_parent() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from auth.users a join public.users u on u.id=a.id
 where a.id=auth.uid() and a.email_confirmed_at is not null
 and coalesce(a.raw_app_meta_data->>'portal_access','false') <> 'true'
 and not exists(select 1 from public.qr_access_tokens q where q.auth_user_id=a.id)
 and u.is_active and u.deleted_at is null
 and coalesce(auth.jwt()->>'session_id','') ~ '^[a-fA-F0-9-]{36}$'
 and not exists(select 1 from public.parent_revoked_sessions r where r.session_id::text=auth.jwt()->>'session_id' and r.user_id=a.id));
$$;
create function public.revoke_current_parent_session() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.is_individual_parent() then raise exception 'Individual session required' using errcode='42501'; end if;
 insert into public.parent_revoked_sessions(session_id,user_id) values((auth.jwt()->>'session_id')::uuid,auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.revoke_current_parent_session() from public,anon;
grant execute on function public.revoke_current_parent_session() to authenticated;
commit;
