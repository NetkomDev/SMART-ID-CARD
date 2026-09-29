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


insert into public.parent_student_links(school_id,parent_user_id,student_id,relationship,status,portal_session_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000001','OTHER','ACTIVE','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
set local role authenticated;
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{attendance,status}'='BELUM_HADIR','empty attendance is honest');
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{waste,total_points}'='0','no invented waste points');
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{library,month_visits}'='0','no invented library visits');
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{extracurricular,status}'='TIDAK_ADA','no invented activity');
do $$ begin
 perform public.get_parent_child_today('80000000-0000-4000-8000-000000000003');
 raise exception 'cross-school leak';
exception when sqlstate 'AP002' then raise notice 'PASS: other school denied'; end $$;
select set_config('request.jwt.claims','{"session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
select pg_temp.check_ok((select count(*)=0 from public.get_parent_children()),'shared QR sessions have isolated children');
do $$ begin
 perform public.get_parent_child_today('80000000-0000-4000-8000-000000000001');
 raise exception 'cross-session leak';
exception when sqlstate 'AP002' then raise notice 'PASS: other parent session denied'; end $$;
select set_config('request.jwt.claims','{"session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
reset role;
update public.schools set timezone='Asia/Makassar', waste_organic_points_per_kg=7.5 where id='20000000-0000-4000-8000-000000000001';
insert into public.waste_transactions(event_id,school_id,class_id,student_id,staff_user_id,organic_kg,inorganic_kg,source) values
 (gen_random_uuid(),'20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',2.4,0,'MANUAL');
insert into public.extracurriculars(id,school_id,code,name) values
 ('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','BSK','Bola Basket');
insert into public.extracurricular_members(school_id,extracurricular_id,student_id,enrolled_by,idempotency_key) values
 ('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',gen_random_uuid());
insert into public.extracurricular_sessions(id,school_id,extracurricular_id,name,starts_at,ends_at,created_by)
 select '90000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','Latihan',
 ((now() at time zone 'Asia/Makassar')::date + time '15:30') at time zone 'Asia/Makassar',
 ((now() at time zone 'Asia/Makassar')::date + time '17:00') at time zone 'Asia/Makassar','10000000-0000-4000-8000-000000000001';
insert into public.extracurricular_attendance(school_id,extracurricular_id,session_id,student_id,status,recorded_by,created_at) values
 ('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001','EXCUSED','10000000-0000-4000-8000-000000000001',now()-interval '1 day');
set local role authenticated;
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{waste,total_points}'='18.00','database points, no inferred conversion');
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{extracurricular,status}'='IZIN','excused is not present; session date drives summary');
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{extracurricular,schedule}'='15.30 – 17.00','real school-local schedule');
reset role;
update public.extracurricular_sessions set status='CANCELLED' where id='90000000-0000-4000-8000-000000000002';
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{extracurricular,status}'='TIDAK_ADA','cancelled sessions excluded');
-- Gate times and day/month boundaries must use the school's timezone, not server UTC.
insert into public.devices(id,school_id,device_code,device_type,name) values
 ('90000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','TEST-GATE','GATE','Test gate');
insert into public.attendance_logs(event_id,school_id,device_id,student_id,card_id,direction,source,occurred_at_local,local_sequence)
 select gen_random_uuid(),c.school_id,'90000000-0000-4000-8000-000000000003',c.student_id,c.id,'CHECK_IN','REALTIME',
 ((now() at time zone 'Asia/Makassar')::date + t.local_time) at time zone 'Asia/Makassar',t.seq
 from public.student_cards c cross join (values(time '06:54',1),(time '09:00',2)) t(local_time,seq)
 where c.card_uid='PORTAL-CARD-1';
insert into public.library_visits(event_id,school_id,device_id,student_id,occurred_at,local_sequence,source)
 select gen_random_uuid(),'20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000001',
 ((now() at time zone 'Asia/Makassar')::date + time '00:01') at time zone 'Asia/Makassar',1,'REALTIME';
insert into public.library_visits(event_id,school_id,device_id,student_id,occurred_at,local_sequence,source)
 select gen_random_uuid(),'20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000001',
 (date_trunc('month',now() at time zone 'Asia/Makassar')-interval '1 minute') at time zone 'Asia/Makassar',2,'REALTIME';
set local role authenticated;
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{attendance,check_in}'='06.54','first arrival displayed in school timezone');
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{library,today_visits}'='1','visit after local midnight belongs to today');
select pg_temp.check_ok(public.get_parent_child_today('80000000-0000-4000-8000-000000000001')#>>'{library,month_visits}'='1','previous month excluded');
reset role;
update public.students set is_active=false where id='80000000-0000-4000-8000-000000000001';
do $$ begin
 perform public.get_parent_child_today('80000000-0000-4000-8000-000000000001');
 raise exception 'inactive student leak';
exception when sqlstate 'AP002' then raise notice 'PASS: inactive student denied'; end $$;
update public.qr_access_tokens set revoked_at=now() where auth_user_id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
 perform public.get_parent_child_today('80000000-0000-4000-8000-000000000001');
 raise exception 'revoked QR leak';
exception when insufficient_privilege then raise notice 'PASS: revoked portal denied'; end $$;
reset role;
rollback;
