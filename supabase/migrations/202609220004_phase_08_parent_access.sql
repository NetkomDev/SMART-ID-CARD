-- AKSIS Phase 08: privacy-safe parent profiles, linking, and child timeline.
begin;

create type public.parent_relationship as enum ('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER');
create type public.parent_link_status as enum ('ACTIVE', 'REVOKED');

create table public.parent_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  full_name varchar(200) not null,
  phone varchar(32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_profiles_name_not_blank check (btrim(full_name) <> '')
);

create table public.parent_link_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null,
  token_hash text not null unique,
  relationship public.parent_relationship not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint parent_link_tokens_student_fk foreign key (school_id, student_id)
    references public.students(school_id, id) on delete cascade,
  constraint parent_link_tokens_hash_format check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint parent_link_tokens_future_expiry check (expires_at > created_at)
);

create table public.parent_student_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  parent_user_id uuid not null references public.users(id) on delete cascade,
  student_id uuid not null,
  relationship public.parent_relationship not null,
  status public.parent_link_status not null default 'ACTIVE',
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint parent_student_links_student_fk foreign key (school_id, student_id)
    references public.students(school_id, id) on delete restrict,
  constraint parent_student_links_identity_key unique (school_id, parent_user_id, student_id),
  constraint parent_student_links_revocation_state check (
    (status = 'ACTIVE' and revoked_at is null) or (status = 'REVOKED' and revoked_at is not null)
  )
);

create trigger parent_profiles_set_updated_at before update on public.parent_profiles
for each row execute function public.set_updated_at();
create index parent_links_parent_idx on public.parent_student_links (parent_user_id, status);
create index parent_links_student_idx on public.parent_student_links (school_id, student_id, status);
create index parent_tokens_expiry_idx on public.parent_link_tokens (expires_at) where used_at is null;

alter table public.parent_profiles enable row level security;
alter table public.parent_profiles force row level security;
alter table public.parent_link_tokens enable row level security;
alter table public.parent_link_tokens force row level security;
alter table public.parent_student_links enable row level security;
alter table public.parent_student_links force row level security;

create policy parent_profiles_self on public.parent_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy parent_tokens_admin on public.parent_link_tokens for all to authenticated
  using (public.has_school_permission(school_id, 'parent.manage'))
  with check (public.has_school_permission(school_id, 'parent.manage'));
create policy parent_links_self_select on public.parent_student_links for select to authenticated
  using (parent_user_id = auth.uid());
create policy parent_links_admin on public.parent_student_links for all to authenticated
  using (public.has_school_permission(school_id, 'parent.manage'))
  with check (public.has_school_permission(school_id, 'parent.manage'));

grant select, insert, update on public.parent_profiles to authenticated;
grant select, insert, update on public.parent_link_tokens to authenticated;
grant select, insert, update on public.parent_student_links to authenticated;

create function public.claim_parent_link(link_token text, profile_name text, profile_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare token_row public.parent_link_tokens; link_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into token_row from public.parent_link_tokens
  where token_hash = encode(digest(link_token, 'sha256'), 'hex')
    and used_at is null and expires_at > now() for update;
  if not found then raise exception 'invalid or expired parent link token' using errcode = 'AP001'; end if;

  insert into public.parent_profiles (user_id, full_name, phone)
  values (auth.uid(), profile_name, profile_phone)
  on conflict (user_id) do update set full_name = excluded.full_name, phone = excluded.phone;
  insert into public.parent_student_links (school_id, parent_user_id, student_id, relationship)
  values (token_row.school_id, auth.uid(), token_row.student_id, token_row.relationship)
  on conflict (school_id, parent_user_id, student_id) do update
    set relationship = excluded.relationship, status = 'ACTIVE', revoked_at = null, linked_at = now()
  returning id into link_id;
  update public.parent_link_tokens set used_at = now() where id = token_row.id;
  return link_id;
end;
$$;

create function public.get_parent_children()
returns table (link_id uuid, student_id uuid, school_id uuid, school_name varchar, full_name varchar, student_number varchar, class_name varchar, relationship public.parent_relationship)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select l.id, s.id, l.school_id, sc.name, s.full_name, s.student_number, c.name, l.relationship
  from public.parent_student_links l
  join public.students s on s.school_id = l.school_id and s.id = l.student_id
  join public.schools sc on sc.id = l.school_id
  left join public.student_class_history h on h.school_id = s.school_id and h.student_id = s.id and h.is_current
  left join public.classes c on c.school_id = h.school_id and c.id = h.class_id
  where l.parent_user_id = auth.uid() and l.status = 'ACTIVE'
    and s.is_active and s.deleted_at is null;
$$;

create function public.get_parent_child_today(target_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare link_row public.parent_student_links; tz text; events jsonb;
begin
  select * into link_row from public.parent_student_links
  where parent_user_id = auth.uid() and student_id = target_student_id and status = 'ACTIVE';
  if not found then raise exception 'child relationship not found' using errcode = 'AP002'; end if;
  select timezone into tz from public.schools where id = link_row.school_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'type', case a.direction when 'CHECK_IN' then 'attendance.check_in' else 'attendance.check_out' end,
    'occurred_at', a.occurred_at_local, 'is_late', a.is_late
  ) order by a.occurred_at_local), '[]'::jsonb) into events
  from public.attendance_logs a where a.school_id = link_row.school_id and a.student_id = target_student_id
    and (a.occurred_at_local at time zone tz)::date = (now() at time zone tz)::date;
  return jsonb_build_object('student_id', target_student_id, 'timezone', tz, 'events', events);
end;
$$;

revoke all on function public.claim_parent_link(text, text, text) from public;
revoke all on function public.get_parent_children() from public;
revoke all on function public.get_parent_child_today(uuid) from public;
grant execute on function public.claim_parent_link(text, text, text) to authenticated;
grant execute on function public.get_parent_children() to authenticated;
grant execute on function public.get_parent_child_today(uuid) to authenticated;

commit;
