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
create function pg_temp.scan(e text,student text,dir text,hm text,note text default '') returns jsonb language sql as $$
 select public.sync_school_attendance('20000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('event_id',e,'device_id','90000000-0000-4000-8000-000000000001','identifier',student,'direction',dir,'occurred_at',((current_timestamp at time zone 'Asia/Makassar')::date-1+hm::time) at time zone 'Asia/Makassar','notes',note,'scanner_name','Guru Uji')))->'results'->0
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.check_ok(public.update_school_attendance_rules('20000000-0000-4000-8000-000000000001','06:30','08:00','14:00')->>'check_in_end'='08:00','admin changes versioned school hours');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
select pg_temp.check_ok(public.attendance_scanner_state('20000000-0000-4000-8000-000000000001')#>>'{rules,check_in_end}'='08:00','lightweight state sends new hours to scanner');
select pg_temp.check_ok(public.can_scan_school_attendance('20000000-0000-4000-8000-000000000001'),'gate role can scan');
select pg_temp.check_ok(not public.has_school_permission('20000000-0000-4000-8000-000000000001','attendance.manage'),'gate cannot manage hours');
select pg_temp.check_ok(jsonb_array_length(public.attendance_scanner_bootstrap('20000000-0000-4000-8000-000000000001')->'students')=2,'school-wide roster across classes, excludes other school');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000002','PORTAL-QR-1','CHECK_IN','07:35','Macet')->>'status'='ACCEPTED','B 07:35 synchronizes first');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000001','A1','CHECK_IN','07:30')->>'status'='REPLACED','A 07:30 replaces B even when synchronized last');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000001','A1','CHECK_IN','07:30')->>'status'='REPLACED','retry same event remains idempotent');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000003','PORTAL-CARD-1','CHECK_IN','07:40')->>'status'='DUPLICATE','different card alias same student recognized duplicate');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000004','A2','CHECK_IN','07:31')->>'status'='NEEDS_REASON','late requires reason');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000004','A2','CHECK_IN','07:31','Ban bocor')->>'status'='ACCEPTED','reason repair retains same event and timestamp');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000005','A2','CHECK_OUT','13:00')->>'status'='NEEDS_REASON','early departure requires reason');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000005','A2','CHECK_OUT','13:00','Sakit')->>'status'='ACCEPTED','early departure with reason accepted for other class');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000006','B1','CHECK_IN','07:00')->>'code'='STUDENT_NOT_FOUND','cross school identifier rejected');
select pg_temp.check_ok(pg_temp.scan('a0000000-0000-4000-8000-000000000005','A2','CHECK_OUT','12:00','Sakit')->>'code'='EVENT_ID_CONFLICT','same event cannot change timestamp');
reset role;
select pg_temp.check_ok((select count(*)=1 and not bool_or(is_late) and count(notes)=0 from public.attendance_logs where student_id='80000000-0000-4000-8000-000000000001' and direction='CHECK_IN'),'one canonical arrival with corrected on-time flag and cleared late note');
select pg_temp.check_ok((select count(*)=5 from public.attendance_scan_events),'audit retains accepted, replaced, duplicate and reason events');
select pg_temp.check_ok(not has_function_privilege('anon','public.sync_school_attendance(uuid,jsonb)','EXECUTE'),'anonymous sync forbidden');
select pg_temp.check_ok(not has_function_privilege('authenticated','public.apply_attendance_scan(uuid,jsonb)','EXECUTE'),'private apply forbidden');
update public.qr_access_tokens set expires_at=now()-interval '1 second' where role_code='GATE_STAFF';
set local role authenticated;
select pg_temp.check_ok(not public.can_scan_school_attendance('20000000-0000-4000-8000-000000000001'),'revoked QR cannot synchronize');
rollback;
