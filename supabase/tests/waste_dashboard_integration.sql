\set ON_ERROR_STOP on
begin;
create function pg_temp.check_ok(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is not true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label;
end $$;
insert into auth.users(id,raw_app_meta_data) values
 ('10000000-0000-4000-8000-000000000001','{}'),
 ('10000000-0000-4000-8000-000000000002','{"portal_access":true}'),
 ('10000000-0000-4000-8000-000000000003','{"portal_access":true}'),
 ('10000000-0000-4000-8000-000000000004','{"portal_access":true}'),
 ('10000000-0000-4000-8000-000000000005','{"portal_access":true}');
insert into public.users(id,full_name) values('10000000-0000-4000-8000-000000000001','Admin A');
insert into public.schools(id,code,name) values
 ('20000000-0000-4000-8000-000000000001','PORTAL_TEST_A','School A'),
 ('20000000-0000-4000-8000-000000000002','PORTAL_TEST_B','School B');
insert into public.school_users(id,school_id,user_id,status,joined_at) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ACTIVE',now());
insert into public.roles(id,school_id,code,name) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','SCHOOL_ADMIN','Admin');
insert into public.school_user_roles(school_id,school_user_id,role_id) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
select public.configure_school_roles('20000000-0000-4000-8000-000000000001');
insert into public.academic_years(id,school_id,name,start_date,end_date,is_active) values
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026/27','2026-07-01','2027-06-30',true);
insert into public.classes(id,school_id,academic_year_id,code,name) values
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','A1','Class A1'),
 ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','A2','Class A2');
insert into public.students(id,school_id,student_number,full_name) values
 ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A1','Student One'),
 ('80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','A2','Student Two'),
 ('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','B1','Other school');
update public.students set date_of_birth='2010-01-01' where id='80000000-0000-4000-8000-000000000001';
insert into public.student_class_history(school_id,student_id,class_id,academic_year_id,start_date,is_current) values
 ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','2026-07-01',true),
 ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','2026-07-01',true);
insert into public.student_cards(school_id,student_id,card_uid,card_serial,qr_key,issued_at,status,production_status) values
 ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','PORTAL-CARD-1','PORTAL-SERIAL-1','PORTAL-QR-1',now(),'ACTIVE','VERIFIED');
select public.provision_portal_access('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',repeat('a',64),'portal-test-waste@local','WASTE_STAFF','{"class_id":"70000000-0000-4000-8000-000000000001"}');
select public.provision_portal_access('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',repeat('b',64),'portal-test-parent@local','PARENT','{"student_id":"80000000-0000-4000-8000-000000000001"}');
select public.provision_portal_access('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',repeat('c',64),'portal-test-library@local','LIBRARY_STAFF','{}');
select public.provision_portal_access('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005',repeat('d',64),'portal-test-teacher@local','TEACHER','{}');

-- Configure points, then seed deposits across two classes as the database owner.
-- A real deposit in tenant B must never enter tenant A's daily summary or rankings.
insert into public.academic_years(id,school_id,name,start_date,end_date,is_active) values
 ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','2026/27','2026-07-01','2027-06-30',true);
insert into public.classes(id,school_id,academic_year_id,code,name) values
 ('70000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002','B1','Other school class');
insert into public.student_class_history(school_id,student_id,class_id,academic_year_id,start_date,is_current) values
 ('20000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','2026-07-01',true);
insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source) values
 (gen_random_uuid(),'20000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',100,0,'MANUAL');
update public.schools set timezone='Asia/Makassar', waste_organic_points_per_kg=7.5,waste_inorganic_points_per_kg=10
 where id='20000000-0000-4000-8000-000000000001';
insert into public.students(id,school_id,student_number,full_name) values
 ('80000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','A4','Zero Deposit');
insert into public.student_class_history(school_id,student_id,class_id,academic_year_id,start_date) values
 ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','2026-07-01');
insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source,points_earned)
 values('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',2.4,0,'MANUAL',999),
 ('90000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',0,4,'MANUAL',999);
select pg_temp.check_ok((select points_earned=18 from public.waste_transactions where event_id='90000000-0000-4000-8000-000000000001'),'points calculated by database, caller value ignored');
update public.schools set waste_organic_points_per_kg=9 where id='20000000-0000-4000-8000-000000000001';
select pg_temp.check_ok((select points_earned=18 from public.waste_transactions where event_id='90000000-0000-4000-8000-000000000001'),'old points preserved after tariff change');
-- More than PostgREST's default 1,000 rows must still be counted.
insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source)
 select gen_random_uuid(),'20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',.001,0,'MANUAL' from generate_series(1,1001);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok((select count(*)=1002 from public.waste_transactions),'raw transactions still class scoped');
select pg_temp.check_ok((select count(*)=1 from public.students),'raw student records still class scoped');
do $$ declare d jsonb; begin
 d:=public.waste_dashboard('20000000-0000-4000-8000-000000000001','today');
 perform pg_temp.check_ok(jsonb_array_length(d->'classes')=2,'dashboard includes both classes');
 perform pg_temp.check_ok((d#>>'{classes,0,class_name}')='Class A2','class order follows total kg');
 perform pg_temp.check_ok((d#>>'{today,total_kg}')::numeric=7.401,'all 1003 transactions aggregated');
 perform pg_temp.check_ok((d#>>'{today,students}')::int=2,'today counts unique students');
 perform pg_temp.check_ok(d->'today'=public.waste_dashboard('20000000-0000-4000-8000-000000000001','month')->'today','monthly ranking does not change today summary');
 perform pg_temp.check_ok(d->'today'=public.waste_dashboard('20000000-0000-4000-8000-000000000001','all')->'today','all-time ranking does not change today summary');
 perform pg_temp.check_ok((d#>>'{top_students,0,full_name}')='Student Two','top student from other class visible');
 perform pg_temp.check_ok(jsonb_array_length(d->'top_students')=2,'zero deposit not called a top depositor');
 perform pg_temp.check_ok((d#>>'{bottom_students,0,full_name}')='Zero Deposit','bottom students includes zero');
 perform pg_temp.check_ok((d#>>'{bottom_students,0,total_kg}')::numeric=0,'zero has correct weight');
 perform pg_temp.check_ok(not (d::text like '%Other school%'),'other school names excluded');
end $$;
do $$ begin
 perform public.waste_dashboard('20000000-0000-4000-8000-000000000002','all');
 raise exception 'FAIL cross school allowed'; exception when insufficient_privilege then raise notice 'PASS: cross school denied'; end $$;
do $$ begin
 perform public.waste_dashboard('20000000-0000-4000-8000-000000000001','invalid');
 raise exception 'FAIL invalid period'; exception when invalid_parameter_value then raise notice 'PASS: invalid period denied'; end $$;
reset role;
-- Move a deposit into last month and confirm school-local period boundaries.
update public.waste_transactions set created_at=date_trunc('month',now() at time zone 'Asia/Makassar') at time zone 'Asia/Makassar' - interval '1 second'
 where event_id='90000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.check_ok((public.waste_dashboard('20000000-0000-4000-8000-000000000001','month')#>>'{classes,0,total_kg}')::numeric=3.401,'month excludes older deposits');
select pg_temp.check_ok((public.waste_dashboard('20000000-0000-4000-8000-000000000001','all')#>>'{classes,0,total_kg}')::numeric=4,'all time includes older deposits');
reset role;
-- Invalid membership must fail even on direct database insertion.
do $$ begin
 insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source)
 values(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',1,0,'MANUAL');
 raise exception 'FAIL mismatched student'; exception when check_violation then raise notice 'PASS: mismatched student denied'; end $$;
-- Direct inserts must obey the school schedule and null tariffs remain unscored.
update public.schools set waste_start_time=((now() at time zone timezone)+interval '1 hour')::time,
 waste_end_time=((now() at time zone timezone)+interval '2 hours')::time where id='20000000-0000-4000-8000-000000000001';
do $$ begin
 insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source)
 values(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',1,0,'MANUAL');
 raise exception 'FAIL closed schedule'; exception when insufficient_privilege then raise notice 'PASS: closed schedule denied at database'; end $$;
update public.schools set waste_start_time=null,waste_end_time=null,waste_organic_points_per_kg=null where id='20000000-0000-4000-8000-000000000001';
insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source)
 values('90000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',1,0,'MANUAL');
select pg_temp.check_ok((select points_earned is null from public.waste_transactions where event_id='90000000-0000-4000-8000-000000000003'),'unconfigured tariffs never invent points');
-- Equal totals have a stable name/ID tie break, independent of query order.
update public.waste_transactions set organic_kg=1.999 where event_id='90000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_ok((public.waste_dashboard('20000000-0000-4000-8000-000000000001','all')#>>'{classes,0,class_name}')='Class A1','equal class totals use deterministic name order');
reset role;
update public.qr_access_tokens set revoked_at=now() where auth_user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 perform public.waste_dashboard('20000000-0000-4000-8000-000000000001','today');
 raise exception 'FAIL revoked access'; exception when insufficient_privilege then raise notice 'PASS: revoked access denied'; end $$;
reset role;
set local role anon;
do $$ begin
 perform public.waste_dashboard('20000000-0000-4000-8000-000000000001','today');
 raise exception 'FAIL anonymous access'; exception when insufficient_privilege then raise notice 'PASS: anonymous access denied'; end $$;
rollback;
