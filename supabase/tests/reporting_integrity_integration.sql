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


insert into public.library_visits(event_id,school_id,device_id,student_id,class_id,occurred_at,local_sequence,source)
 select gen_random_uuid(),'20000000-0000-4000-8000-000000000001',null,'80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',now(),i,'REALTIME' from generate_series(1,25001) i;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.check_ok((public.report_classes('20000000-0000-4000-8000-000000000001')#>>'{rows,0,library_visits}')::bigint=25001,'SQL totals exceed PostgREST row cap');
select pg_temp.check_ok((public.report_class_students('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001')#>>'{rows,0,library_visits}')::bigint=25001,'class student totals complete');
select pg_temp.check_ok((public.report_library_summary('20000000-0000-4000-8000-000000000001')->0->>'total')::bigint=25001,'library totals complete');
create temp table saved_export as select public.create_report_export('20000000-0000-4000-8000-000000000001','library') manifest;
select pg_temp.check_ok((select (manifest->>'row_count')::int=25001 from saved_export),'export snapshot has all 25001 rows');
do $$ declare m jsonb; p jsonb; n int:=0; ids uuid[]:='{}'; begin
 select manifest into m from saved_export;
 loop
 p:=public.read_report_export((m->>'id')::uuid,n,100);
 select ids||coalesce(array_agg((value->>'id')::uuid),'{}'::uuid[]) into ids from jsonb_array_elements(p->'rows');
 n:=n+jsonb_array_length(p->'rows'); exit when p->>'next_offset' is null;
 end loop;
 perform pg_temp.check_ok(n=25001,'export reads all pages with cap 100');
 perform pg_temp.check_ok((select count(distinct value)=25001 from unnest(ids) value),'export pages contain no duplicates');
end $$;
reset role;
insert into public.library_visits(event_id,school_id,student_id,class_id,occurred_at,local_sequence,source) values(gen_random_uuid(),'20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',now(),25002,'REALTIME');
set local role authenticated;
select pg_temp.check_ok((select (public.read_report_export((manifest->>'id')::uuid)->>'row_count')::int=25001 from saved_export),'snapshot unchanged by new source transaction');
reset role;
select pg_temp.check_ok(not has_function_privilege('authenticated','public.increment_api_rate(text,integer)','execute'),'rate store unavailable to client identities');
select pg_temp.check_ok((public.increment_api_rate(repeat('a',64),60000)->>'total_hits')::int=1,'distributed bucket first hit');
select pg_temp.check_ok((public.increment_api_rate(repeat('a',64),60000)->>'total_hits')::int=2,'distributed bucket shared state');
rollback;
