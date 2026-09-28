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
select pg_temp.check_ok(not has_function_privilege('authenticated','public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb)','EXECUTE'),'provision restricted to service role');
select pg_temp.check_ok(not has_function_privilege('authenticated','public.generate_shadow_access(uuid,text,text,text,character varying,jsonb,timestamp with time zone)','EXECUTE'),'legacy unsafe RPC disabled');

do $$ begin
 perform public.provision_portal_access('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',repeat('e',64),'cross@local','TEACHER','{}');
 raise exception 'FAIL: cross tenant provisioning accepted';
 exception when insufficient_privilege then raise notice 'PASS: cross tenant provisioning denied';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(public.portal_session_active(),'waste session active');
select pg_temp.check_ok((public.get_portal_context()->'metadata'->>'class_id')='70000000-0000-4000-8000-000000000001','class scope returned');
select pg_temp.check_ok((select count(*)=1 from public.students),'waste sees only own class student, not other class or school');
select pg_temp.check_ok((select count(*)=1 from public.classes),'waste sees only assigned class');
select pg_temp.check_ok(not public.can_manage_portal_access('20000000-0000-4000-8000-000000000001'),'portal cannot mint QR');
insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source)
 values(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',auth.uid(),1,0,'MANUAL');
do $$ begin
 insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source)
 values(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002',auth.uid(),1,0,'MANUAL');
 raise exception 'FAIL: wrong class accepted'; exception when insufficient_privilege then raise notice 'PASS: wrong class mutation denied'; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select pg_temp.check_ok(public.has_school_permission('20000000-0000-4000-8000-000000000001','library.visit'),'library permission provisioned');
select public.record_portal_library_visit('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','PORTAL-CARD-1',now(),1);
select pg_temp.check_ok((public.record_portal_library_visit('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','PORTAL-CARD-1',now(),1)->>'duplicate')::boolean,'library retries idempotent');
select pg_temp.check_ok((select count(*)=1 from public.library_visits),'one human visit without device credential');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select public.link_student_to_parent_portal('A1','2010-01-01','Test Parent');
select pg_temp.check_ok((select count(*)=1 from public.get_parent_children()),'parent sees linked child only');
select pg_temp.check_ok(jsonb_array_length(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')->'events')=2,'parent timeline includes waste and library');
do $$ begin
 perform public.get_parent_child_today('80000000-0000-4000-8000-000000000002');
 raise exception 'FAIL: unrelated child accepted'; exception when sqlstate 'AP002' then raise notice 'PASS: unrelated child denied'; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select pg_temp.check_ok(public.has_school_permission('20000000-0000-4000-8000-000000000001','extracurricular.attendance'),'teacher attendance permission provisioned');
reset role;
update public.qr_access_tokens set expires_at=now()-interval '1 second' where auth_user_id='10000000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.check_ok(not public.portal_session_active(),'expired session denied');
select pg_temp.check_ok((select count(*)=0 from public.students),'expired JWT cannot read rows');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.revoke_portal_access(id) from public.qr_access_tokens where auth_user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(not public.portal_session_active(),'revoked access denied');
select pg_temp.check_ok((select count(*)=0 from public.waste_transactions),'revoked JWT cannot read transactions');
rollback;
