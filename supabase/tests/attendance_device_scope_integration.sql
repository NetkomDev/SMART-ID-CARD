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
update public.schools set timezone='Asia/Makassar' where code like 'PORTAL_TEST_%';
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
insert into auth.users(id,raw_app_meta_data) values ('10000000-0000-4000-8000-000000000006','{"portal_access":true}');
select public.provision_portal_access('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006',repeat('f',64),'gate-test@local','GATE_STAFF','{}');
insert into public.attendance_rule_versions(school_id,effective_at,entry_start,on_time_until,checkout_start) values('20000000-0000-4000-8000-000000000001','-infinity','06:30','07:30','14:00');

select public.provision_portal_access('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',repeat('c',64),'library-audit@local','LIBRARY_STAFF','{}','audit-token');
insert into public.devices(id,school_id,device_code,device_type,name,status,config) values
 ('90000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','PHYSICAL','GATE','Physical gate','ACTIVE','{}'),
 ('90000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','OTHER-PWA','GATE','Other school','ACTIVE','{"is_mobile_pwa":true}');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
select pg_temp.check_ok((public.bind_attendance_scanner('90000000-0000-4000-8000-000000000001','Guru A')->>'bound')::boolean,'gate portal can bind its own phone');
select pg_temp.check_ok((public.bind_attendance_scanner('90000000-0000-4000-8000-000000000001','Guru B')->>'scanner_name')='Guru B','same phone can update name');
do $$ begin perform public.bind_attendance_scanner('90000000-0000-4000-8000-000000000002','Attack'); raise exception 'physical overwrite accepted'; exception when insufficient_privilege then raise notice 'PASS physical device protected';end $$;
do $$ begin perform public.bind_attendance_scanner('90000000-0000-4000-8000-000000000003','Attack'); raise exception 'cross school overwrite accepted'; exception when insufficient_privilege then raise notice 'PASS cross-school device protected';end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$ begin perform public.bind_attendance_scanner('90000000-0000-4000-8000-000000000004','Attack'); raise exception 'library portal accepted'; exception when insufficient_privilege then raise notice 'PASS wrong portal denied';end $$;
reset role;
select pg_temp.check_ok((select name='Physical gate' from public.devices where id='90000000-0000-4000-8000-000000000002'),'physical device unchanged');
select pg_temp.check_ok(not has_function_privilege('anon','public.bind_attendance_scanner(uuid,text)','EXECUTE'),'anonymous bind forbidden');
rollback;
