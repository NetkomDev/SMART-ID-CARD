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

select set_config('request.jwt.claims','{"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
-- Shared QR account must never become a family principal, even knowing a child's ID.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.check_ok(not public.can_access_parent_child('80000000-0000-4000-8000-000000000001'),'shared QR cannot access children');
select pg_temp.check_ok((select count(*)=0 from public.parent_student_links),'shared QR cannot enumerate device/link IDs');
do $$ begin
 perform public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000001'); raise exception 'FAIL shared QR';
exception when insufficient_privilege then raise notice 'PASS shared QR denied'; end $$;
select pg_temp.check_ok(not has_function_privilege('authenticated','public.get_parent_child_today(uuid,text)','execute'),'historical device RPC revoked');
select pg_temp.check_ok(not has_function_privilege('authenticated','public.link_student_to_parent_portal(text,date,text,text)','execute'),'DOB linking RPC revoked');
reset role;
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000006','parent-a@example.test',now()),
 ('10000000-0000-4000-8000-000000000007','parent-b@example.test',now());
insert into public.users(id,full_name) values ('10000000-0000-4000-8000-000000000006','Parent A'),('10000000-0000-4000-8000-000000000007','Parent B');
insert into public.parent_link_tokens(school_id,student_id,token_hash,relationship,expires_at) values
 ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',encode(digest(repeat('i',43),'sha256'),'hex'),'MOTHER',now()+interval '1 day'),
 ('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002',encode(digest(repeat('j',43),'sha256'),'hex'),'FATHER',now()+interval '1 day');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select public.ensure_parent_profile('Parent A');
select pg_temp.check_ok((public.claim_parent_invitation(repeat('i',43))->>'accepted')::boolean,'individual claims single-use invitation');
select pg_temp.check_ok(not (public.claim_parent_invitation(repeat('i',43))->>'accepted')::boolean,'invitation replay rejected');
select pg_temp.check_ok((select count(*)=1 from public.get_verified_parent_children()),'one verified child');
select pg_temp.check_ok(public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{attendance,status}'='BELUM_HADIR','honest empty attendance');
select pg_temp.check_ok(public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{waste,total_points}'='0','honest empty points');
select pg_temp.check_ok(public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{library,month_visits}'='0','honest empty library');
select pg_temp.check_ok(public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000001')->>'contract_version'='2','versioned rich contract');
do $$ begin
 perform public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000002'); raise exception 'FAIL cross family';
exception when insufficient_privilege then raise notice 'PASS cross-family read denied'; end $$;
do $$ begin
 perform public.update_student_photo_by_parent('80000000-0000-4000-8000-000000000002','data:image/jpeg;base64,/9j/'); raise exception 'FAIL cross family photo';
exception when insufficient_privilege then raise notice 'PASS cross-family photo denied'; end $$;
do $$ begin
 perform public.update_student_photo_by_parent('80000000-0000-4000-8000-000000000001','bad<img>'); raise exception 'FAIL invalid photo';
exception when invalid_parameter_value then raise notice 'PASS invalid photo denied'; end $$;
do $$ begin
 insert into public.student_absence_permits(school_id,student_id,parent_user_id,permit_date,reason) values('20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002',auth.uid(),current_date,'IZIN'); raise exception 'FAIL direct permit';
exception when insufficient_privilege then raise notice 'PASS direct permit denied'; end $$;
select pg_temp.check_ok((public.submit_student_absence_permit('80000000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Jakarta')::date,'SAKIT','day one',null)->>'success')::boolean,'permit does not require dashboard permission');
do $$ begin
 perform public.submit_student_absence_permit('80000000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Jakarta')::date+1,'SAKIT','day two',null); raise exception 'FAIL missing attachment';
exception when invalid_parameter_value then raise notice 'PASS medical image required day two'; end $$;
select pg_temp.check_ok(public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{attendance,status}'='SAKIT','permit integrated in summary');
reset role;
update public.schools set timezone='Asia/Makassar',waste_organic_points_per_kg=7.5 where id='20000000-0000-4000-8000-000000000001';
insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source) values(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',2.4,0,'MANUAL');
set local role authenticated;
select pg_temp.check_ok((public.get_verified_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{waste,total_points}')::numeric=18,'real waste points in rich contract');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
select public.ensure_parent_profile('Parent B');
select pg_temp.check_ok((public.claim_parent_invitation(repeat('j',43))->>'accepted')::boolean,'second family claims own child');
select pg_temp.check_ok((select count(*)=1 from public.parent_student_links),'RLS only own verified link');
select pg_temp.check_ok(not public.can_access_parent_child('80000000-0000-4000-8000-000000000001'),'same school different family denied');
select pg_temp.check_ok(not (public.claim_parent_invitation('invalid1')->>'accepted')::boolean,'invalid claim fails');
select public.claim_parent_invitation('invalid2'); select public.claim_parent_invitation('invalid3'); select public.claim_parent_invitation('invalid4'); select public.claim_parent_invitation('invalid5');
select pg_temp.check_ok(public.claim_parent_invitation('invalid6')->>'code'='RATE_LIMITED','database claim limiter persists failures');
reset role;
update public.parent_student_links set status='REVOKED',revoked_at=now() where parent_user_id='10000000-0000-4000-8000-000000000007';
set local role authenticated;
select pg_temp.check_ok(not public.can_access_parent_child('80000000-0000-4000-8000-000000000002'),'revocation effective with same JWT');
reset role;
select pg_temp.check_ok((select count(*)>0 from public.audit_logs where action='parent.link.claimed'),'claim audit persists in transaction');
select pg_temp.check_ok((select count(*)>0 from public.audit_logs where action='parent.permit.submitted'),'permit audit persists');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select public.revoke_current_parent_session();
select pg_temp.check_ok(not public.can_access_parent_child('80000000-0000-4000-8000-000000000001'),'logged-out JWT cannot replay family access');
reset role;
rollback;
