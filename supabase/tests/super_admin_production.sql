\set ON_ERROR_STOP on
begin;
create function pg_temp.check_ok(ok boolean,label text) returns void language plpgsql as $$begin if ok is not true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
create function pg_temp.denied(command text,label text) returns void language plpgsql as $$begin begin execute command;exception when others then if sqlstate not in ('42501','23503','23505','23514','P0001','P0002','AG004','AG006') then raise;end if;raise notice 'PASS: % (%)',label,sqlerrm;return;end;raise exception 'FAIL: % unexpectedly succeeded',label;end$$;
insert into auth.users(id,raw_app_meta_data) values
 ('10000000-0000-4000-8000-000000000001','{"platform_role":"SUPER_ADMIN"}'),
 ('10000000-0000-4000-8000-000000000002','{}'),
 ('10000000-0000-4000-8000-000000000003','{}');
insert into public.users(id,full_name) values ('10000000-0000-4000-8000-000000000001','Platform Admin'),('10000000-0000-4000-8000-000000000002','School Admin');
insert into public.schools(id,code,name) values('20000000-0000-4000-8000-000000000001','SA_TEST_A','School A'),('20000000-0000-4000-8000-000000000002','SA_TEST_B','School B');
select public.configure_school_roles('20000000-0000-4000-8000-000000000001');
select public.configure_school_roles('20000000-0000-4000-8000-000000000002');
insert into public.school_users(id,school_id,user_id,status,joined_at) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','ACTIVE',now());
insert into public.school_user_roles(school_id,school_user_id,role_id) select school_id,'30000000-0000-4000-8000-000000000001',id from public.roles where school_id='20000000-0000-4000-8000-000000000001' and code='SCHOOL_ADMIN';
insert into public.students(id,school_id,student_number,full_name) values
 ('80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A1','Student A'),
 ('80000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','A2','Student B'),
 ('80000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','B1','Student Other School');
insert into public.devices(id,school_id,device_code,name,device_type,status) values('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','STATION_A','Station A','CARD_STATION','ACTIVE'),('90000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','STATION_B','Station B','CARD_STATION','ACTIVE');
insert into public.device_credentials(school_id,device_id,secret_hash,label) values('20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',encode(digest('station-a-test-secret','sha256'),'hex'),'test'),('20000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002',encode(digest('station-b-test-secret','sha256'),'hex'),'test');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_ok(not public.is_platform_admin(),'School admin is not platform admin');
select pg_temp.check_ok(public.can_manage_portal_access('20000000-0000-4000-8000-000000000001') and not public.can_manage_portal_access('20000000-0000-4000-8000-000000000002'),'Only the tenant school admin can issue portal QR');
select pg_temp.check_ok((select count(*)=1 from public.schools),'Tenant sees only their school');
select pg_temp.check_ok(public.has_school_permission('20000000-0000-4000-8000-000000000001','library.read') and public.has_school_permission('20000000-0000-4000-8000-000000000001','waste.create'),'Provisioned permissions match module policies');
select pg_temp.denied($q$insert into public.roles(school_id,code,name) values('20000000-0000-4000-8000-000000000001','SUPER_ADMIN','Escalated')$q$,'Cannot create a platform role through tenant IAM');
select pg_temp.denied($q$select public.platform_update_school('20000000-0000-4000-8000-000000000002','Hacked','Asia/Makassar','ACTIVE')$q$,'Tenant cannot mutate platform school');
select pg_temp.denied($q$select public.create_card_batch('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',array['80000000-0000-4000-8000-000000000001']::uuid[])$q$,'Tenant cannot create production batch');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.check_ok(public.is_platform_admin(),'Trusted platform admin recognized without tenant membership');
select pg_temp.check_ok(not public.can_manage_portal_access('20000000-0000-4000-8000-000000000001'),'Platform dashboard cannot issue school portal QR');
select pg_temp.check_ok((select count(*)=2 from public.schools),'Platform sees both schools');
select public.create_card_batch('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',array['80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002']::uuid[]);
select pg_temp.check_ok((select count(*)=2 and bool_and(status='BLOCKED' and production_status='DRAFT' and card_uid is null and issued_at is null and length(qr_key)=48) from public.student_cards),'Cards start inactive with opaque QR and no chip UID');
select public.create_card_batch('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',array['80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002']::uuid[]);
select pg_temp.check_ok((select count(*)=2 from public.student_cards),'Batch replay does not duplicate cards');
select pg_temp.denied($q$select public.create_card_batch('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',array['80000000-0000-4000-8000-000000000003']::uuid[])$q$,'Cross-school students rejected atomically');
select pg_temp.denied($q$select public.card_batch_action('70000000-0000-4000-8000-000000000001',gen_random_uuid(),'RELEASED','QC checked')$q$,'Cannot release before print confirmation');
select id as card_a,qr_key as qr_a from public.student_cards where student_id='80000000-0000-4000-8000-000000000001' \gset
select id as card_b,qr_key as qr_b from public.student_cards where student_id='80000000-0000-4000-8000-000000000002' \gset
select pg_temp.denied(format('update public.student_cards set status=''ACTIVE'',revoked_at=null,production_status=''VERIFIED'',card_uid=''AABBCCDD'' where id=%L',:'card_a'),'Direct activation bypass blocked');
select pg_temp.denied(format('select public.set_card_status(%L,''ACTIVE'',''attempt bypass'')',:'card_a'),'Status API cannot activate unfinished card');
select public.card_batch_action('70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','PRINTED','Printed and checked');
select public.card_batch_action('70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','RELEASED','All QR scans checked');
select public.card_batch_action('70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','RELEASED','All QR scans checked');
select pg_temp.check_ok((select count(*)=2 from public.card_write_jobs),'Release creates exactly one job per card, including replay');
select pg_temp.denied(format('update public.card_write_jobs set status=''SUCCEEDED'' where card_id=%L',:'card_a'),'Direct job success bypass blocked');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.denied(format('select public.claim_card_write_job(''90000000-0000-4000-8000-000000000002'',''station-b-test-secret'',%L,''AABBCCDD'')',:'qr_a'),'Station cannot claim another school QR');
select public.claim_card_write_job('90000000-0000-4000-8000-000000000001','station-a-test-secret',:'qr_b','AABBCC02') as claim_b \gset
select pg_temp.check_ok((:'claim_b'::jsonb#>>'{job,expected_qr}')=:'qr_b','Scan second QR claims its job, not FIFO first card');
select pg_temp.denied(format('select public.claim_card_write_job(''90000000-0000-4000-8000-000000000001'',''station-a-test-secret'',%L,''AABBCC02'')',:'qr_b'),'Leased card cannot be claimed twice');
select public.complete_card_write_job('90000000-0000-4000-8000-000000000001','station-a-test-secret',(:'claim_b'::jsonb#>>'{job,id}')::uuid,(:'claim_b'::jsonb#>>'{job,lease_token}')::uuid,'AABBCC02','AKS1:'||:'qr_b',:'qr_a') as fail_b \gset
select pg_temp.check_ok(:'fail_b'::jsonb->>'status'='FAILED','QR mismatch hard fails');
select public.claim_card_write_job('90000000-0000-4000-8000-000000000001','station-a-test-secret',:'qr_a','AABBCC01') as claim_a \gset
select pg_temp.denied(format('select public.complete_card_write_job(''90000000-0000-4000-8000-000000000001'',''station-a-test-secret'',%L,null,''AABBCC01'',%L,%L)',(:'claim_a'::jsonb#>>'{job,id}')::uuid,'AKS1:'||:'qr_a',:'qr_a'),'Null lease token cannot bypass station verification');
select public.complete_card_write_job('90000000-0000-4000-8000-000000000001','station-a-test-secret',(:'claim_a'::jsonb#>>'{job,id}')::uuid,(:'claim_a'::jsonb#>>'{job,lease_token}')::uuid,'AABBCC01','AKS1:'||:'qr_a',:'qr_a') as success_a \gset
select pg_temp.check_ok(:'success_a'::jsonb->>'status'='SUCCEEDED','Real observations matching QR, UID and memory succeed');
select pg_temp.check_ok(public.complete_card_write_job('90000000-0000-4000-8000-000000000001','station-a-test-secret',(:'claim_a'::jsonb#>>'{job,id}')::uuid,(:'claim_a'::jsonb#>>'{job,lease_token}')::uuid,'AABBCC01','AKS1:'||:'qr_a',:'qr_a')=:'success_a'::jsonb,'Completion retry returns persisted result');
reset role;
select pg_temp.check_ok((select status='ACTIVE' and production_status='VERIFIED' and issued_at is not null from public.student_cards where id=:'card_a'),'Successful verification activates card atomically');
select pg_temp.check_ok((select status='BLOCKED' and production_status='FAILED' from public.student_cards where id=:'card_b'),'Mismatch card remains unusable');
select pg_temp.check_ok((select count(*)=1 from public.card_write_logs where job_id=(:'claim_a'::jsonb#>>'{job,id}')::uuid),'Completion replay does not duplicate logs');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.manage_card_job((:'claim_b'::jsonb#>>'{job,id}')::uuid,'RETRY','Physical card inspected');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select public.claim_card_write_job('90000000-0000-4000-8000-000000000001','station-a-test-secret',:'qr_b','AABBCC02') as claim_retry \gset
reset role;
update public.card_write_jobs set attempt_count=max_attempts,lease_expires_at=now()-interval '1 minute' where id=(:'claim_retry'::jsonb#>>'{job,id}')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.reconcile_card_jobs();
select pg_temp.check_ok((select status='FAILED' and last_error_code='LEASE_EXPIRED' from public.card_write_jobs where id=(:'claim_retry'::jsonb#>>'{job,id}')::uuid),'Last expired attempt becomes FAILED instead of stuck LEASED');
select pg_temp.check_ok(public.resolve_student_card('20000000-0000-4000-8000-000000000001',:'qr_a')->>'id'='80000000-0000-4000-8000-000000000001','Opaque QR resolves the owner for authorized staff');
select pg_temp.check_ok(public.record_portal_library_visit('20000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',:'qr_a',now(),1)->>'student_name'='Student A','Library recognizes the printed QR and records the owner');
select pg_temp.denied(format('select public.resolve_student_card(''20000000-0000-4000-8000-000000000002'',%L)',:'qr_a'),'QR lookup cannot cross selected school boundary');
select public.set_card_status(:'card_a','LOST','Owner reported card missing');
select pg_temp.denied(format('select public.resolve_student_card(''20000000-0000-4000-8000-000000000001'',%L)',:'qr_a'),'Lost card QR cannot resolve an active owner');
select public.create_card_batch('70000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',array['80000000-0000-4000-8000-000000000001']::uuid[],null,:'card_a');
select pg_temp.check_ok((select count(distinct qr_key)=2 from public.student_cards where student_id='80000000-0000-4000-8000-000000000001'),'Replacement has a new unique QR');
select pg_temp.denied(format('select public.set_card_status(%L,''ACTIVE'',''restore old card'')',:'card_a'),'Old card cannot reactivate while replacement is pending');
select public.platform_update_school('20000000-0000-4000-8000-000000000002','School B updated','Asia/Makassar','SUSPENDED');
select pg_temp.check_ok(exists(select 1 from public.audit_logs where school_id='20000000-0000-4000-8000-000000000002' and action='UPDATE_SCHOOLS' and before_data->>'name'='School B' and after_data->>'name'='School B updated'),'Audit records target school, before and after in transaction');
reset role;
select public.provision_school('72000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Provisioned','SA_TEST_C','Asia/Makassar','New Admin',null,'test-hash') as provisioned \gset
select pg_temp.check_ok(exists(select 1 from public.school_users m join public.school_user_roles a on a.school_user_id=m.id join public.roles r on r.id=a.role_id where m.user_id='10000000-0000-4000-8000-000000000003' and m.status='ACTIVE' and r.code='SCHOOL_ADMIN'),'Provisioning creates profile, membership and administrator role together');
select pg_temp.check_ok(public.provision_school('72000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Provisioned','SA_TEST_C','Asia/Makassar','New Admin',null,'test-hash')=:'provisioned'::jsonb,'Provisioning replay is idempotent');
select pg_temp.denied($q$select public.provision_school('72000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000099','Bad','SA_TEST_BAD','Asia/Makassar','Missing auth user',null,'bad')$q$,'Provisioning database failure rolls back all records');
select pg_temp.check_ok(not exists(select 1 from public.schools where code='SA_TEST_BAD'),'Failed provisioning leaves no partial school');
update auth.users set raw_app_meta_data='{}' where id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_ok(not public.is_platform_admin(),'Revoking trusted metadata immediately removes platform authority');
rollback;
