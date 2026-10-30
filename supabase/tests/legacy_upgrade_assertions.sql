begin;
do $$ begin
 if not exists(select 1 from public.parent_student_links where parent_user_id='99000000-0000-4000-8000-000000000001' and status='REVOKED' and revoked_at is not null and verified_at is null and verification_source='LEGACY_REVERIFY') then raise exception 'Legacy link not quarantined'; end if;
 if not exists(select 1 from public.students where id='99000000-0000-4000-8000-000000000003') then raise exception 'Legacy child lost'; end if;
 raise notice 'PASS: legacy history preserved and relationship requires reverification';
end $$;
select set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin if public.can_access_parent_child('99000000-0000-4000-8000-000000000003') then raise exception 'Legacy family access survived'; end if; end $$;
rollback;
