-- AKSIS Phase 01-02: core tenancy, academic/card/device data, RBAC, and RLS.
-- Tenant bootstrap and the first SCHOOL_ADMIN membership must be performed by a
-- trusted backend using the Supabase service role (which bypasses RLS).

begin;

create extension if not exists pgcrypto;

create type public.school_status as enum ('ACTIVE', 'SUSPENDED', 'INACTIVE');
create type public.membership_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
create type public.gender_type as enum ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');
create type public.card_status as enum ('ACTIVE', 'LOST', 'BLOCKED', 'REPLACED', 'EXPIRED');
create type public.device_type as enum ('GATE', 'LIBRARY', 'LED', 'CARD_STATION', 'WASTE_SCALE', 'OTHER');
create type public.device_status as enum ('PROVISIONING', 'ACTIVE', 'DISABLED', 'MAINTENANCE', 'RETIRED');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null,
  name varchar(200) not null,
  status public.school_status not null default 'ACTIVE',
  timezone varchar(64) not null default 'Asia/Jakarta',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint schools_code_key unique (code),
  constraint schools_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,49}$'),
  constraint schools_name_not_blank check (btrim(name) <> ''),
  constraint schools_deleted_state check (deleted_at is null or is_active = false)
);

-- Application profile only; authentication credentials remain in auth.users.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name varchar(200) not null,
  phone varchar(32),
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint users_name_not_blank check (btrim(full_name) <> ''),
  constraint users_deleted_state check (deleted_at is null or is_active = false)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  code varchar(64) not null,
  name varchar(120) not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint roles_school_code_key unique (school_id, code),
  constraint roles_school_id_id_key unique (school_id, id),
  constraint roles_code_format check (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint roles_name_not_blank check (btrim(name) <> ''),
  constraint roles_deleted_state check (deleted_at is null or is_active = false)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  code varchar(100) not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint permissions_school_code_key unique (school_id, code),
  constraint permissions_school_id_id_key unique (school_id, id),
  constraint permissions_code_format check (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint permissions_deleted_state check (deleted_at is null or is_active = false)
);

create table public.school_users (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  status public.membership_status not null default 'INVITED',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint school_users_school_user_key unique (school_id, user_id),
  constraint school_users_school_id_id_key unique (school_id, id),
  constraint school_users_active_joined check (status <> 'ACTIVE' or joined_at is not null),
  constraint school_users_deleted_state check (deleted_at is null or status = 'REVOKED')
);

create table public.school_user_roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  school_user_id uuid not null,
  role_id uuid not null,
  assigned_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint school_user_roles_assignment_key unique (school_id, school_user_id, role_id),
  constraint school_user_roles_membership_fk foreign key (school_id, school_user_id)
    references public.school_users(school_id, id) on delete cascade,
  constraint school_user_roles_role_fk foreign key (school_id, role_id)
    references public.roles(school_id, id) on delete cascade
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  role_id uuid not null,
  permission_id uuid not null,
  created_at timestamptz not null default now(),
  constraint role_permissions_grant_key unique (school_id, role_id, permission_id),
  constraint role_permissions_role_fk foreign key (school_id, role_id)
    references public.roles(school_id, id) on delete cascade,
  constraint role_permissions_permission_fk foreign key (school_id, permission_id)
    references public.permissions(school_id, id) on delete cascade
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name varchar(32) not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint academic_years_school_name_key unique (school_id, name),
  constraint academic_years_school_id_id_key unique (school_id, id),
  constraint academic_years_valid_dates check (end_date >= start_date),
  constraint academic_years_name_not_blank check (btrim(name) <> ''),
  constraint academic_years_deleted_state check (deleted_at is null or is_active = false)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null,
  code varchar(50) not null,
  name varchar(120) not null,
  grade_level smallint,
  homeroom_teacher_user_id uuid references public.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint classes_academic_year_fk foreign key (school_id, academic_year_id)
    references public.academic_years(school_id, id) on delete restrict,
  constraint classes_school_year_code_key unique (school_id, academic_year_id, code),
  constraint classes_school_id_id_key unique (school_id, id),
  constraint classes_tenant_year_identity unique (school_id, id, academic_year_id),
  constraint classes_grade_range check (grade_level is null or grade_level between 1 and 12),
  constraint classes_text_not_blank check (btrim(code) <> '' and btrim(name) <> ''),
  constraint classes_deleted_state check (deleted_at is null or is_active = false)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  nisn varchar(20),
  student_number varchar(50) not null,
  full_name varchar(200) not null,
  gender public.gender_type not null default 'UNDISCLOSED',
  date_of_birth date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null,
  constraint students_school_number_key unique (school_id, student_number),
  constraint students_school_nisn_key unique (school_id, nisn),
  constraint students_school_id_id_key unique (school_id, id),
  constraint students_nisn_format check (nisn is null or nisn ~ '^[0-9]{10}$'),
  constraint students_text_not_blank check (btrim(student_number) <> '' and btrim(full_name) <> ''),
  constraint students_birth_not_future check (date_of_birth is null or date_of_birth <= current_date),
  constraint students_deleted_state check (deleted_at is null or is_active = false)
);

create table public.student_class_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  start_date date not null,
  end_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_class_history_student_fk foreign key (school_id, student_id)
    references public.students(school_id, id) on delete restrict,
  constraint student_class_history_class_fk foreign key (school_id, class_id, academic_year_id)
    references public.classes(school_id, id, academic_year_id) on delete restrict,
  constraint student_class_history_year_fk foreign key (school_id, academic_year_id)
    references public.academic_years(school_id, id) on delete restrict,
  constraint student_class_history_identity_key unique (school_id, student_id, academic_year_id, class_id, start_date),
  constraint student_class_history_valid_dates check (end_date is null or end_date >= start_date),
  constraint student_class_history_current_open check (not is_current or end_date is null)
);

create table public.student_cards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null,
  card_uid varchar(64) not null,
  card_serial varchar(100) not null,
  qr_key varchar(128) not null,
  status public.card_status not null default 'ACTIVE',
  issued_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_cards_student_fk foreign key (school_id, student_id)
    references public.students(school_id, id) on delete restrict,
  constraint student_cards_school_uid_key unique (school_id, card_uid),
  constraint student_cards_school_serial_key unique (school_id, card_serial),
  constraint student_cards_qr_key_key unique (qr_key),
  constraint student_cards_school_id_id_key unique (school_id, id),
  constraint student_cards_values_not_blank check (
    btrim(card_uid) <> '' and btrim(card_serial) <> '' and btrim(qr_key) <> ''
  ),
  constraint student_cards_revocation_state check (
    (status = 'ACTIVE' and revoked_at is null)
    or (status <> 'ACTIVE' and revoked_at is not null)
  ),
  constraint student_cards_expiry_valid check (expires_at is null or issued_at is null or expires_at > issued_at)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  device_code varchar(64) not null,
  device_type public.device_type not null,
  name varchar(120) not null,
  location varchar(200),
  firmware_version varchar(50),
  hardware_version varchar(50),
  update_channel varchar(32) not null default 'stable',
  status public.device_status not null default 'PROVISIONING',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint devices_school_code_key unique (school_id, device_code),
  constraint devices_school_id_id_key unique (school_id, id),
  constraint devices_text_not_blank check (btrim(device_code) <> '' and btrim(name) <> ''),
  constraint devices_deleted_state check (deleted_at is null or status = 'RETIRED')
);

create unique index academic_years_one_active_per_school
  on public.academic_years (school_id) where is_active and deleted_at is null;
create unique index student_history_one_current_per_student
  on public.student_class_history (school_id, student_id) where is_current;
create unique index student_cards_one_active_per_student
  on public.student_cards (school_id, student_id) where status = 'ACTIVE';
create index school_users_user_status_idx on public.school_users (user_id, status, school_id);
create index school_user_roles_role_idx on public.school_user_roles (school_id, role_id);
create index role_permissions_permission_idx on public.role_permissions (school_id, permission_id);
create index classes_year_idx on public.classes (school_id, academic_year_id) where deleted_at is null;
create index students_name_idx on public.students (school_id, full_name) where deleted_at is null;
create index student_history_class_idx on public.student_class_history (school_id, class_id, is_current);
create index student_history_year_idx on public.student_class_history (school_id, academic_year_id);
create index student_cards_student_idx on public.student_cards (school_id, student_id, status);
create index devices_type_status_idx on public.devices (school_id, device_type, status);
create index devices_last_seen_idx on public.devices (school_id, last_seen_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger schools_set_updated_at before update on public.schools
for each row execute function public.set_updated_at();
create trigger users_set_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles
for each row execute function public.set_updated_at();
create trigger permissions_set_updated_at before update on public.permissions
for each row execute function public.set_updated_at();
create trigger school_users_set_updated_at before update on public.school_users
for each row execute function public.set_updated_at();
create trigger academic_years_set_updated_at before update on public.academic_years
for each row execute function public.set_updated_at();
create trigger classes_set_updated_at before update on public.classes
for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();
create trigger student_class_history_set_updated_at before update on public.student_class_history
for each row execute function public.set_updated_at();
create trigger student_cards_set_updated_at before update on public.student_cards
for each row execute function public.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
for each row execute function public.set_updated_at();

-- SECURITY DEFINER prevents recursive RLS while checking membership. It returns
-- only a boolean and has a fixed search_path to avoid object-shadowing attacks.
create function public.has_school_access(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_users su
    join public.users u on u.id = su.user_id
    join public.schools s on s.id = su.school_id
    where su.school_id = target_school_id
      and su.user_id = auth.uid()
      and su.status = 'ACTIVE'
      and su.deleted_at is null
      and u.is_active
      and u.deleted_at is null
      and s.status = 'ACTIVE'
      and s.is_active
      and s.deleted_at is null
  );
$$;

create function public.has_school_permission(target_school_id uuid, permission_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.school_users su
    join public.school_user_roles sur
      on sur.school_id = su.school_id and sur.school_user_id = su.id
    join public.roles r
      on r.school_id = sur.school_id and r.id = sur.role_id
    join public.role_permissions rp
      on rp.school_id = r.school_id and rp.role_id = r.id
    join public.permissions p
      on p.school_id = rp.school_id and p.id = rp.permission_id
    where su.school_id = target_school_id
      and su.user_id = auth.uid()
      and su.status = 'ACTIVE' and su.deleted_at is null
      and r.is_active and r.deleted_at is null
      and p.is_active and p.deleted_at is null
      and p.code = permission_code
  );
$$;

revoke all on function public.has_school_access(uuid) from public;
revoke all on function public.has_school_permission(uuid, text) from public;
grant execute on function public.has_school_access(uuid) to authenticated;
grant execute on function public.has_school_permission(uuid, text) to authenticated;

alter table public.schools enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.school_users enable row level security;
alter table public.school_user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_class_history enable row level security;
alter table public.student_cards enable row level security;
alter table public.devices enable row level security;

alter table public.schools force row level security;
alter table public.users force row level security;
alter table public.roles force row level security;
alter table public.permissions force row level security;
alter table public.school_users force row level security;
alter table public.school_user_roles force row level security;
alter table public.role_permissions force row level security;
alter table public.academic_years force row level security;
alter table public.classes force row level security;
alter table public.students force row level security;
alter table public.student_class_history force row level security;
alter table public.student_cards force row level security;
alter table public.devices force row level security;

-- Identity tables deliberately expose only the caller's own profile plus active
-- memberships. All administrative mutation goes through permission-aware APIs.
create policy users_select_self on public.users for select to authenticated
  using (id = auth.uid());
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy schools_select_member on public.schools for select to authenticated
  using (public.has_school_access(id));
create policy school_users_select_member on public.school_users for select to authenticated
  using (public.has_school_access(school_id));
create policy roles_select_member on public.roles for select to authenticated
  using (public.has_school_access(school_id));
create policy permissions_select_member on public.permissions for select to authenticated
  using (public.has_school_access(school_id));
create policy school_user_roles_select_member on public.school_user_roles for select to authenticated
  using (public.has_school_access(school_id));
create policy role_permissions_select_member on public.role_permissions for select to authenticated
  using (public.has_school_access(school_id));

-- RBAC administration. `iam.manage` is intentionally required for every write.
create policy school_users_manage on public.school_users for all to authenticated
  using (public.has_school_permission(school_id, 'iam.manage'))
  with check (public.has_school_permission(school_id, 'iam.manage'));
create policy roles_manage on public.roles for all to authenticated
  using (public.has_school_permission(school_id, 'iam.manage'))
  with check (public.has_school_permission(school_id, 'iam.manage'));
create policy permissions_manage on public.permissions for all to authenticated
  using (public.has_school_permission(school_id, 'iam.manage'))
  with check (public.has_school_permission(school_id, 'iam.manage'));
create policy school_user_roles_manage on public.school_user_roles for all to authenticated
  using (public.has_school_permission(school_id, 'iam.manage'))
  with check (public.has_school_permission(school_id, 'iam.manage'));
create policy role_permissions_manage on public.role_permissions for all to authenticated
  using (public.has_school_permission(school_id, 'iam.manage'))
  with check (public.has_school_permission(school_id, 'iam.manage'));

-- Domain reads require active school membership; writes require a scoped
-- permission. This supports least privilege without trusting client route guards.
create policy academic_years_select on public.academic_years for select to authenticated
  using (public.has_school_access(school_id));
create policy academic_years_manage on public.academic_years for all to authenticated
  using (public.has_school_permission(school_id, 'academic.manage'))
  with check (public.has_school_permission(school_id, 'academic.manage'));

create policy classes_select on public.classes for select to authenticated
  using (public.has_school_access(school_id));
create policy classes_manage on public.classes for all to authenticated
  using (public.has_school_permission(school_id, 'academic.manage'))
  with check (public.has_school_permission(school_id, 'academic.manage'));

create policy students_select on public.students for select to authenticated
  using (public.has_school_permission(school_id, 'student.read'));
create policy students_insert on public.students for insert to authenticated
  with check (public.has_school_permission(school_id, 'student.create'));
create policy students_update on public.students for update to authenticated
  using (public.has_school_permission(school_id, 'student.update'))
  with check (public.has_school_permission(school_id, 'student.update'));

create policy student_history_select on public.student_class_history for select to authenticated
  using (public.has_school_permission(school_id, 'student.read'));
create policy student_history_manage on public.student_class_history for all to authenticated
  using (public.has_school_permission(school_id, 'student.update'))
  with check (public.has_school_permission(school_id, 'student.update'));

create policy student_cards_select on public.student_cards for select to authenticated
  using (public.has_school_permission(school_id, 'card.read'));
create policy student_cards_manage on public.student_cards for all to authenticated
  using (public.has_school_permission(school_id, 'card.manage'))
  with check (public.has_school_permission(school_id, 'card.manage'));

create policy devices_select on public.devices for select to authenticated
  using (public.has_school_permission(school_id, 'device.read'));
create policy devices_manage on public.devices for all to authenticated
  using (public.has_school_permission(school_id, 'device.manage'))
  with check (public.has_school_permission(school_id, 'device.manage'));

-- Supabase exposes public schema through PostgREST. Explicit grants combine with
-- RLS; anonymous receives no table privileges.
revoke all on all tables in schema public from anon;
grant select on public.schools, public.users, public.roles, public.permissions,
  public.school_users, public.school_user_roles, public.role_permissions,
  public.academic_years, public.classes, public.students,
  public.student_class_history, public.student_cards, public.devices to authenticated;
grant insert, update, delete on public.roles, public.permissions, public.school_users,
  public.school_user_roles, public.role_permissions, public.academic_years,
  public.classes, public.students, public.student_class_history,
  public.student_cards, public.devices to authenticated;
grant update on public.users to authenticated;

comment on table public.users is 'Application profile linked to Supabase auth.users; contains no password.';
comment on column public.student_cards.qr_key is 'Opaque random identifier only; must not encode student PII.';
comment on function public.has_school_access(uuid) is 'True only for active human membership in an active school.';

commit;
