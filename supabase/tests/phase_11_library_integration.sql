\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin
  if value is not true then raise exception 'ASSERTION FAILED: %', message; end if;
end $$;

-- Deterministic two-tenant fixture. The transaction is rolled back at the end.
insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into public.users(id,full_name) values
  ('10000000-0000-4000-8000-000000000001','Library Staff A'),
  ('10000000-0000-4000-8000-000000000002','Library Staff B');
insert into public.schools(id,code,name) values
  ('20000000-0000-4000-8000-000000000001','TEST_LIBRARY_A','School A'),
  ('20000000-0000-4000-8000-000000000002','TEST_LIBRARY_B','School B');
insert into public.school_users(id,school_id,user_id,status,joined_at) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ACTIVE',now()),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','ACTIVE',now());
insert into public.roles(id,school_id,code,name) values
  ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','LIBRARY_STAFF','Library Staff'),
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','LIBRARY_STAFF','Library Staff');
insert into public.permissions(id,school_id,code) values
  ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','library.read'),
  ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','library.read');
insert into public.school_user_roles(school_id,school_user_id,role_id) values
  ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002');
insert into public.role_permissions(school_id,role_id,permission_id) values
  ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002');

insert into public.academic_years(id,school_id,name,start_date,end_date,is_active) values
  ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026/2027','2026-07-01','2027-06-30',true),
  ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','2026/2027','2026-07-01','2027-06-30',true);
insert into public.classes(id,school_id,academic_year_id,code,name) values
  ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','A-1','Class A'),
  ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','B-1','Class B');
insert into public.students(id,school_id,student_number,full_name) values
  ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A001','Student A'),
  ('80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','B001','Student B');
insert into public.student_class_history(school_id,student_id,class_id,academic_year_id,start_date,is_current) values
  ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-07-01',true),
  ('20000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','2026-07-01',true);
insert into public.student_cards(school_id,student_id,card_uid,card_serial,qr_key,status,issued_at) values
  ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','CARD-A','SERIAL-A','QR-A','ACTIVE',now()),
  ('20000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','CARD-B','SERIAL-B','QR-B','ACTIVE',now());
insert into public.devices(id,school_id,device_code,device_type,name,status) values
  ('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','LIB-A','LIBRARY','Library A','ACTIVE'),
  ('90000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','LIB-B','LIBRARY','Library B','ACTIVE');
insert into public.device_credentials(school_id,device_id,secret_hash,label) values
  ('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',encode(digest('secret-a','sha256'),'hex'),'test'),
  ('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002',encode(digest('secret-b','sha256'),'hex'),'test');

-- Source transactions for both tenants.
select public.ingest_library_visit('90000000-0000-4000-8000-000000000001','secret-a','a0000000-0000-4000-8000-000000000001','CARD-A',now(),1,'REALTIME','{}');
select public.ingest_library_visit('90000000-0000-4000-8000-000000000002','secret-b','b0000000-0000-4000-8000-000000000001','CARD-B',now(),1,'REALTIME','{}');

-- (1) RLS isolation: staff A can see A only, and staff B can see B only.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*)=1 and bool_and(school_id='20000000-0000-4000-8000-000000000001') from public.library_visits),'staff A must only see school A');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select count(*)=1 and bool_and(school_id='20000000-0000-4000-8000-000000000002') from public.library_visits),'staff B must only see school B');
reset role;

-- (2) A device ID combined with B credentials must be rejected.
do $$ begin
  perform public.ingest_library_visit('90000000-0000-4000-8000-000000000001','secret-b','a0000000-0000-4000-8000-000000000002','CARD-A',now(),2,'REALTIME','{}');
  raise exception 'ASSERTION FAILED: cross-tenant credential was accepted';
exception when invalid_authorization_specification then null; end $$;

-- (3) Replaying an event returns duplicate=true and leaves one source row/event.
select pg_temp.assert_true(
  (public.ingest_library_visit('90000000-0000-4000-8000-000000000001','secret-a','a0000000-0000-4000-8000-000000000001','CARD-A',now(),99,'REALTIME','{}')->>'duplicate')::boolean,
  'replayed event must be marked duplicate');
select pg_temp.assert_true((select count(*)=1 from public.library_visits where school_id='20000000-0000-4000-8000-000000000001' and event_id='a0000000-0000-4000-8000-000000000001'),'replay must not duplicate visit');
select pg_temp.assert_true((select count(*)=1 from public.library_events where school_id='20000000-0000-4000-8000-000000000001' and event_type='library.visit.created'),'replay must not duplicate event');

-- (4) Per-class summary reconciles exactly with source transactions.
select pg_temp.assert_true(not exists (
  with expected(school_id,class_id,total) as (values
    ('20000000-0000-4000-8000-000000000001'::uuid,'70000000-0000-4000-8000-000000000001'::uuid,1::bigint),
    ('20000000-0000-4000-8000-000000000002'::uuid,'70000000-0000-4000-8000-000000000002'::uuid,1::bigint)
  ), summary as (select school_id,class_id,count(*) total from public.library_visits group by school_id,class_id)
  select * from ((select * from expected except select * from summary) union all (select * from summary except select * from expected)) mismatch
), 'summary must reconcile with source visits');

rollback;
