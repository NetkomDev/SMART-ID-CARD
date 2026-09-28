-- AKSIS Phase 17: QR Code Shadow Authentication

begin;

create table public.qr_access_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  token_hash text not null unique,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  shadow_email text not null unique,
  role_code varchar(50) not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  constraint qr_access_tokens_hash_format check (token_hash ~ '^[a-f0-9]{64}$')
);

-- Enable RLS
alter table public.qr_access_tokens enable row level security;
alter table public.qr_access_tokens force row level security;

-- Policies for Admins to view/manage tokens
create policy "Admins can manage qr access tokens"
on public.qr_access_tokens
for all
to authenticated
using (
  exists (
    select 1 from public.school_users su
    join public.school_user_roles sur on sur.school_user_id = su.id
    join public.roles r on r.id = sur.role_id
    where su.user_id = auth.uid()
    and su.school_id = qr_access_tokens.school_id
    and r.code in ('SUPER_ADMIN', 'SCHOOL_ADMIN')
  )
);

-- RPC for generating shadow user
create or replace function public.generate_shadow_access(
  p_school_id uuid,
  p_token_hash text,
  p_shadow_email text,
  p_shadow_password text,
  p_role_code varchar,
  p_metadata jsonb,
  p_expires_at timestamptz default null
) returns uuid
language plpgsql security definer
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_role_id uuid;
begin
  -- 1. Check if caller is admin
  if not exists (
    select 1 from public.school_users su
    join public.school_user_roles sur on sur.school_user_id = su.id
    join public.roles r on r.id = sur.role_id
    where su.user_id = auth.uid()
    and su.school_id = p_school_id
    and r.code in ('SUPER_ADMIN', 'SCHOOL_ADMIN')
  ) then
    raise exception 'Unauthorized to generate access for this school';
  end if;

  -- 2. Get the target role id
  select id into v_role_id from public.roles where school_id = p_school_id and code = p_role_code;
  if v_role_id is null then
    raise exception 'Role not found';
  end if;

  -- 3. Create auth.user
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
    p_shadow_email, crypt(p_shadow_password, gen_salt('bf')), now(), now(), now(), '', '', '', ''
  );

  -- 4. Create public.users
  insert into public.users (id, full_name, is_active) 
  values (v_user_id, 'Shadow User (' || p_role_code || ')', true);

  -- 5. Create school_users and assign role
  insert into public.school_users (id, school_id, user_id, status, joined_at)
  values (gen_random_uuid(), p_school_id, v_user_id, 'ACTIVE', now());

  insert into public.school_user_roles (school_id, school_user_id, role_id, assigned_by)
  select p_school_id, id, v_role_id, auth.uid()
  from public.school_users where user_id = v_user_id;

  -- 6. Insert token
  insert into public.qr_access_tokens (
    school_id, token_hash, auth_user_id, shadow_email, role_code, metadata, expires_at
  ) values (
    p_school_id, p_token_hash, v_user_id, p_shadow_email, p_role_code, p_metadata, p_expires_at
  );

  -- 7. Handle Parent Linking
  if p_role_code = 'PARENT' then
    insert into public.parent_profiles (user_id, full_name)
    values (v_user_id, 'Orang Tua (Akses QR)');
    
    insert into public.parent_student_links (school_id, parent_user_id, student_id, relationship, status)
    values (p_school_id, v_user_id, (p_metadata->>'student_id')::uuid, 'OTHER', 'ACTIVE');
  end if;

  return v_user_id;
end;
$$;

commit;
