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


update public.students set nisn='0012345678' where id='80000000-0000-4000-8000-000000000001';
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
('10000000-0000-4000-8000-000000000006','guardian-a@aksis.local',now(),'{"parent_passwordless":true}'),
('10000000-0000-4000-8000-000000000007','guardian-b@aksis.local',now(),'{"parent_passwordless":true}');
select public.enroll_parent_portal(repeat('b',64),'10000000-0000-4000-8000-000000000006','0012345678','2010-01-01','Wali A','+6281234567890');
select pg_temp.check_ok((select count(*)=1 from public.parent_portal_identities),'one isolated guardian identity');
select pg_temp.check_ok(not has_function_privilege('anon','public.enroll_parent_portal(text,uuid,text,date,text,text)','execute'),'anonymous cannot provision accounts');
select pg_temp.check_ok(not has_function_privilege('authenticated','public.consume_parent_recovery(text)','execute'),'browser cannot consume secret through direct RPC');
do $$ begin
 perform public.enroll_parent_portal(repeat('b',64),'10000000-0000-4000-8000-000000000007','0012345678','2010-01-01','Wali B','+6281234567890');
 raise exception 'FAIL duplicate WA'; exception when unique_violation then raise notice 'PASS duplicate WA rejected atomically'; end $$;
select pg_temp.check_ok(not exists(select 1 from public.users where id='10000000-0000-4000-8000-000000000007'),'failed enrollment leaves no public profile');
do $$ begin
 perform public.enroll_parent_portal(repeat('b',64),'10000000-0000-4000-8000-000000000007','0012345678','2011-01-01','Wali B','+6281234567891');
 raise exception 'FAIL incorrect DOB'; exception when invalid_parameter_value then raise notice 'PASS incorrect DOB rejected'; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
insert into auth.sessions values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','10000000-0000-4000-8000-000000000006');
set local role authenticated;
select pg_temp.check_ok(public.can_access_parent_child('80000000-0000-4000-8000-000000000001'),'enrolled guardian can access linked child');
select pg_temp.check_ok(not public.can_access_parent_child('80000000-0000-4000-8000-000000000002'),'guardian cannot access another child');
select pg_temp.check_ok(not public.can_access_parent_child('80000000-0000-4000-8000-000000000003'),'guardian cannot cross school');
do $$ begin
 perform public.issue_parent_recovery('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006',repeat('e',64));
 raise exception 'FAIL guardian issued own recovery'; exception when insufficient_privilege then raise notice 'PASS only school admin issues recovery'; end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.issue_parent_recovery('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006',repeat('e',64));
select public.issue_parent_recovery('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006',repeat('f',64));
reset role;
select pg_temp.check_ok(public.consume_parent_recovery(repeat('e',64)) is null,'rotation revokes older QR');
select pg_temp.check_ok(public.consume_parent_recovery(repeat('f',64))='10000000-0000-4000-8000-000000000006','valid recovery binds exact guardian');
select pg_temp.check_ok(public.consume_parent_recovery(repeat('f',64)) is null,'recovery is single use');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select pg_temp.check_ok(not public.can_access_parent_child('80000000-0000-4000-8000-000000000001'),'recovery revokes lost phone JWT');
select set_config('request.jwt.claims','{"session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
select pg_temp.check_ok(public.can_access_parent_child('80000000-0000-4000-8000-000000000001'),'fresh recovery session retains family relationship');
reset role;
rollback;
