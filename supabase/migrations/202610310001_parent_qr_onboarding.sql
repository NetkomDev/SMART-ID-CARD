begin;
-- Each guardian has a distinct Auth identity. School QR is an enrollment gate only.
create table public.parent_portal_identities (
 school_id uuid not null references public.schools(id),
 user_id uuid not null references public.parent_profiles(user_id),
 phone varchar(32) not null check(phone ~ '^\+628[0-9]{8,11}$'),
 created_at timestamptz not null default now(),
 primary key(school_id,user_id), unique(school_id,phone)
);
alter table public.parent_portal_identities enable row level security;
revoke all on public.parent_portal_identities from public,anon,authenticated;
create table public.parent_recovery_tokens (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 user_id uuid not null references public.parent_profiles(user_id), token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid not null references public.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours', used_at timestamptz, revoked_at timestamptz
);
alter table public.parent_recovery_tokens enable row level security;
revoke all on public.parent_recovery_tokens from public,anon,authenticated;

create function public.enroll_parent_portal(p_token_hash text,p_user_id uuid,p_nisn text,p_dob date,p_name text,p_phone text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.qr_access_tokens; child_id uuid;
begin
 select t.* into q from public.qr_access_tokens t join public.schools sc on sc.id=t.school_id
 where t.token_hash=p_token_hash and t.role_code='PARENT' and t.revoked_at is null
 and (t.expires_at is null or t.expires_at>now()) and sc.is_active and sc.status='ACTIVE' and sc.deleted_at is null for share of t;
 if not found then raise exception 'QR atau data anak tidak sesuai. Hubungi admin sekolah.' using errcode='22023'; end if;
 select s.id into child_id from public.students s where s.school_id=q.school_id and s.nisn=p_nisn
 and s.date_of_birth=p_dob and s.is_active and s.deleted_at is null;
 if child_id is null then raise exception 'QR atau data anak tidak sesuai. Hubungi admin sekolah.' using errcode='22023'; end if;
 if p_phone !~ '^\+628[0-9]{8,11}$' or length(btrim(p_name)) not between 3 and 200 then raise exception 'Identitas wali tidak valid' using errcode='22023'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and raw_app_meta_data->>'parent_passwordless'='true') then raise exception 'Akun wali tidak valid' using errcode='42501'; end if;
 insert into public.users(id,full_name,phone) values(p_user_id,btrim(p_name),p_phone);
 insert into public.parent_profiles(user_id,full_name,phone) values(p_user_id,btrim(p_name),p_phone);
 insert into public.parent_portal_identities(school_id,user_id,phone) values(q.school_id,p_user_id,p_phone);
 insert into public.parent_student_links(school_id,parent_user_id,student_id,relationship,status,verified_at,verification_source)
 values(q.school_id,p_user_id,child_id,'GUARDIAN','ACTIVE',now(),'SCHOOL_QR_NISN_DOB');
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id)
 values(q.school_id,p_user_id,'parent.enrolled','parent',p_user_id);
 return child_id;
end $$;
revoke all on function public.enroll_parent_portal(text,uuid,text,date,text,text) from public,anon,authenticated;
grant execute on function public.enroll_parent_portal(text,uuid,text,date,text,text) to service_role;

create function public.issue_parent_recovery(p_school uuid,p_user uuid,p_hash text) returns timestamptz
language plpgsql security definer set search_path=pg_catalog,public as $$
declare expiry timestamptz;
begin
 if not public.can_manage_portal_access(p_school) then raise exception 'Admin sekolah diperlukan' using errcode='42501'; end if;
 if not exists(select 1 from public.parent_portal_identities i join public.parent_student_links l on l.parent_user_id=i.user_id and l.school_id=i.school_id
 join public.students s on s.id=l.student_id and s.school_id=l.school_id
 join public.users u on u.id=i.user_id
 where i.school_id=p_school and i.user_id=p_user and l.status='ACTIVE' and l.verified_at is not null
 and s.is_active and s.deleted_at is null and u.is_active and u.deleted_at is null) then raise exception 'Wali aktif tidak ditemukan' using errcode='22023'; end if;
 -- Serialize rotation for this guardian; only the latest personal QR is valid.
 perform 1 from public.parent_portal_identities where school_id=p_school and user_id=p_user for update;
 update public.parent_recovery_tokens set revoked_at=now() where school_id=p_school and user_id=p_user and used_at is null and revoked_at is null;
 insert into public.parent_recovery_tokens(school_id,user_id,token_hash,created_by) values(p_school,p_user,p_hash,auth.uid()) returning expires_at into expiry;
 perform public.family_audit(p_school,'parent.recovery.issued',p_user);
 return expiry;
end $$;
revoke all on function public.issue_parent_recovery(uuid,uuid,text) from public,anon;
grant execute on function public.issue_parent_recovery(uuid,uuid,text) to authenticated;

create function public.consume_parent_recovery(p_hash text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.parent_recovery_tokens;
begin
 select r.* into t from public.parent_recovery_tokens r
 join public.users u on u.id=r.user_id join public.schools sc on sc.id=r.school_id
 where r.token_hash=p_hash and r.used_at is null and r.revoked_at is null and r.expires_at>now()
 and u.is_active and u.deleted_at is null and sc.is_active and sc.status='ACTIVE' and sc.deleted_at is null
 and exists(select 1 from public.parent_student_links l join public.students s on s.id=l.student_id and s.school_id=l.school_id
 where l.parent_user_id=r.user_id and l.school_id=r.school_id and l.status='ACTIVE' and l.verified_at is not null and s.is_active and s.deleted_at is null)
 for update of r;
 if not found then return null; end if;
 update public.parent_recovery_tokens set used_at=now() where id=t.id;
 -- Deny old access JWTs immediately, including a lost phone's session.
 insert into public.parent_revoked_sessions(session_id,user_id) select id,user_id from auth.sessions where user_id=t.user_id on conflict do nothing;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id)
 values(t.school_id,t.user_id,'parent.recovery.used','parent',t.user_id);
 return t.user_id;
end $$;
revoke all on function public.consume_parent_recovery(text) from public,anon,authenticated;
grant execute on function public.consume_parent_recovery(text) to service_role;
notify pgrst,'reload schema';
commit;
