begin;
alter table public.card_write_jobs add column completion_token uuid;
alter table public.card_write_jobs add column completion_device_id uuid;
alter table public.card_write_jobs add column completion_result jsonb;
-- Legacy unverified queues cannot bypass physical print/QC.
update public.card_write_jobs set status='CANCELLED',leased_by_device_id=null,lease_token=null,lease_expires_at=null,last_error_code='LEGACY_QUEUE_REQUIRES_QC',completed_at=now() where status in ('QUEUED','LEASED');
drop function public.claim_card_write_job(uuid,text,integer);
drop function public.complete_card_write_job(uuid,text,uuid,uuid,text,text,boolean,text);
create function public.card_station(p_device uuid,p_secret text) returns public.devices language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;begin
 select dv.* into d from public.devices dv join public.device_credentials dc on dc.device_id=dv.id and dc.school_id=dv.school_id join public.schools s on s.id=dv.school_id
 where dv.id=p_device and dv.device_type='CARD_STATION' and dv.status='ACTIVE' and dv.deleted_at is null and s.is_active and s.status='ACTIVE' and s.deleted_at is null
 and dc.secret_hash=encode(digest(p_secret,'sha256'),'hex') and dc.revoked_at is null and(dc.expires_at is null or dc.expires_at>now()) limit 1;
 if not found then raise exception 'Invalid card station credential' using errcode='28000';end if;return d;
end$$;
revoke all on function public.card_station(uuid,text) from public,anon,authenticated;
create function public.reap_card_jobs(p_school uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare c record;j public.card_write_jobs;begin
 perform pg_advisory_xact_lock(hashtextextended('production:'||p_school::text,0));
 for c in select sc.id from public.student_cards sc where sc.school_id=p_school and exists(select 1 from public.card_write_jobs w where w.card_id=sc.id and w.status='LEASED' and w.lease_expires_at<=now()) order by sc.id for update skip locked loop
 for j in select * from public.card_write_jobs where card_id=c.id and status='LEASED' and lease_expires_at<=now() for update loop
 update public.card_write_jobs set status=case when attempt_count>=max_attempts then 'FAILED'::public.card_write_job_status else 'QUEUED'::public.card_write_job_status end,leased_by_device_id=null,lease_token=null,lease_expires_at=null,last_error_code='LEASE_EXPIRED',completed_at=case when attempt_count>=max_attempts then now() else null end where id=j.id;
 update public.student_cards set production_status=case when j.attempt_count>=j.max_attempts then 'FAILED' else 'READY_TO_WRITE' end where id=c.id;
 insert into public.audit_logs(school_id,action,resource_type,resource_id,metadata) values(p_school,'CARD_LEASE_EXPIRED','card_write_jobs',j.id,jsonb_build_object('attempt',j.attempt_count));
 end loop;end loop;
end$$;
revoke all on function public.reap_card_jobs(uuid) from public,anon,authenticated;
create function public.reconcile_card_jobs() returns void language plpgsql security definer set search_path=pg_catalog,public as $$declare s record;begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501';end if;
 for s in select distinct school_id from public.card_write_jobs where status='LEASED' and lease_expires_at<=now() loop perform public.reap_card_jobs(s.school_id);end loop;
end$$;
create function public.claim_card_write_job(target_device_id uuid,device_secret text,p_qr text,p_uid text,p_lease_seconds integer default 120) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;j public.card_write_jobs;c public.student_cards;token uuid:=gen_random_uuid();begin
 d:=public.card_station(target_device_id,device_secret);
 perform pg_advisory_xact_lock(hashtextextended('production:'||d.school_id::text,0));
 if p_uid is null or p_qr is null or p_lease_seconds is null or p_lease_seconds not between 30 and 600 or p_uid !~ '^[0-9A-F]{8,20}$' then raise exception 'Invalid lease or chip UID';end if;
 perform public.reap_card_jobs(d.school_id);
 select * into c from public.student_cards where school_id=d.school_id and qr_key=p_qr for update;
 if not found or c.production_status not in ('READY_TO_WRITE','WRITING') or c.status<>'BLOCKED' or (c.expires_at is not null and c.expires_at<=now()) then raise exception 'QR has no eligible printed card';end if;
 if not exists(select 1 from public.students where id=c.student_id and school_id=d.school_id and is_active and deleted_at is null) then raise exception 'Student inactive';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_uid,1));
 if exists(select 1 from public.student_cards where upper(card_uid)=p_uid and id<>c.id) or (c.card_uid is not null and c.card_uid<>p_uid) then raise exception 'Chip already bound to a different card';end if;
 select * into j from public.card_write_jobs where card_id=c.id and status='QUEUED' and attempt_count<max_attempts order by created_at for update limit 1;
 if not found then raise exception 'No available job for this QR; another station may hold its lease';end if;
 update public.student_cards set card_uid=p_uid,production_status='WRITING' where id=c.id;
 update public.card_write_jobs set status='LEASED',attempt_count=attempt_count+1,leased_by_device_id=d.id,lease_token=token,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),completion_token=null,completion_result=null,completion_device_id=null where id=j.id returning * into j;
 return jsonb_build_object('job',jsonb_build_object('id',j.id,'lease_token',token,'lease_expires_at',j.lease_expires_at,'attempt',j.attempt_count,'student_name',c.print_snapshot->>'student_name','expected_uid',p_uid,'expected_rfid','AKS1:'||c.qr_key,'expected_qr',c.qr_key));
end$$;
create function public.complete_card_write_job(target_device_id uuid,device_secret text,p_job_id uuid,p_lease_token uuid,p_observed_uid text,p_observed_rfid text,p_observed_qr text,p_retryable boolean default false,p_error_code text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;j public.card_write_jobs;c public.student_cards;rfid_ok boolean;qr_ok boolean;ok boolean;result jsonb;err text;next_status public.card_write_job_status;begin
 d:=public.card_station(target_device_id,device_secret);
 perform pg_advisory_xact_lock(hashtextextended('production:'||d.school_id::text,0));
 select sc.* into c from public.student_cards sc join public.card_write_jobs w on w.card_id=sc.id where w.id=p_job_id and w.school_id=d.school_id for update of sc;
 if not found then raise exception 'Job not found' using errcode='P0002';end if;
 select * into j from public.card_write_jobs where id=p_job_id for update;
 if j.completion_token=p_lease_token and j.completion_device_id=d.id then return j.completion_result;end if;
 if j.status<>'LEASED' or j.leased_by_device_id is distinct from d.id or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now() then raise exception 'Invalid or expired lease' using errcode='42501';end if;
 rfid_ok:=coalesce(p_observed_rfid='AKS1:'||c.qr_key and p_observed_uid=c.card_uid,false);qr_ok:=coalesce(p_observed_qr=c.qr_key,false);
 ok:=rfid_ok and qr_ok and p_error_code is null and c.production_status='WRITING' and c.status='BLOCKED' and (c.expires_at is null or c.expires_at>now()) and exists(select 1 from public.students where id=c.student_id and is_active and deleted_at is null);
 err:=case when ok then null when p_error_code='HARDWARE_IO_FAILED' then p_error_code when not rfid_ok then 'RFID_MISMATCH' when not qr_ok then 'QR_MISMATCH' else 'CARD_INELIGIBLE' end;
 next_status:=case when ok then 'SUCCEEDED'::public.card_write_job_status when p_retryable and p_error_code='HARDWARE_IO_FAILED' and p_observed_rfid='' and p_observed_qr='' and j.attempt_count<j.max_attempts then 'QUEUED'::public.card_write_job_status else 'FAILED'::public.card_write_job_status end;
 result:=jsonb_build_object('job_id',j.id,'status',next_status,'rfid_verified',rfid_ok,'qr_verified',qr_ok,'error_code',err);
 insert into public.card_write_logs(school_id,job_id,device_id,attempt,expected_rfid,observed_rfid,expected_qr,observed_qr,rfid_verified,qr_verified,success,error_code) values(d.school_id,j.id,d.id,j.attempt_count,'AKS1:'||c.qr_key,p_observed_rfid,c.qr_key,p_observed_qr,rfid_ok,qr_ok,ok,err);
 update public.card_write_jobs set status=next_status,leased_by_device_id=null,lease_token=null,lease_expires_at=null,last_error_code=err,completed_at=case when next_status='QUEUED' then null else now() end,completion_token=p_lease_token,completion_device_id=d.id,completion_result=result where id=j.id;
 update public.student_cards set production_status=case when ok then 'VERIFIED' when next_status='QUEUED' then 'READY_TO_WRITE' else 'FAILED' end,status=case when ok then 'ACTIVE'::public.card_status else 'BLOCKED'::public.card_status end,issued_at=case when ok then now() else issued_at end,revoked_at=case when ok then null else now() end where id=c.id;
 if ok and c.replaces_card_id is not null then update public.student_cards set status='REPLACED',revoked_at=now() where id=c.replaces_card_id;end if;
 insert into public.audit_logs(school_id,action,resource_type,resource_id,after_data,metadata) values(d.school_id,'CARD_WRITE_COMPLETED','student_cards',c.id,result,jsonb_build_object('device_id',d.id,'job_id',j.id,'attempt',j.attempt_count));
 return result;
end$$;
create function public.manage_card_job(p_job uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.card_write_jobs;c public.student_cards;begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501';end if;
 if p_reason is null or p_action is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'Reason required';end if;
 select school_id into j.school_id from public.card_write_jobs where id=p_job;
 perform pg_advisory_xact_lock(hashtextextended('production:'||j.school_id::text,0));
 select sc.* into c from public.student_cards sc join public.card_write_jobs w on w.card_id=sc.id where w.id=p_job for update of sc;
 select * into j from public.card_write_jobs where id=p_job for update;if not found then raise exception 'Job not found';end if;
 if p_action='RETRY' and j.attempt_count<10 and j.status='FAILED' and c.production_status='FAILED' then
 update public.card_write_jobs set status='QUEUED',max_attempts=least(10,greatest(max_attempts,attempt_count+3)),completed_at=null,completion_token=null,completion_result=null,completion_device_id=null where id=j.id;
 update public.student_cards set production_status='READY_TO_WRITE' where id=c.id;
 elsif p_action='CANCEL' and j.status in ('QUEUED','LEASED','FAILED') then
 update public.card_write_jobs set status='CANCELLED',leased_by_device_id=null,lease_token=null,lease_expires_at=null,completed_at=now() where id=j.id;
 update public.student_cards set production_status='CANCELLED',status='BLOCKED',revoked_at=now() where id=c.id;
 else raise exception 'Job cannot transition';end if;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,metadata) values(c.school_id,auth.uid(),'CARD_JOB_'||p_action,'card_write_jobs',j.id,jsonb_build_object('reason',p_reason,'previous_attempt_count',j.attempt_count));
end$$;
revoke all on function public.claim_card_write_job(uuid,text,text,text,integer),public.complete_card_write_job(uuid,text,uuid,uuid,text,text,text,boolean,text) from public,authenticated;
grant execute on function public.claim_card_write_job(uuid,text,text,text,integer),public.complete_card_write_job(uuid,text,uuid,uuid,text,text,text,boolean,text) to anon;
revoke all on function public.manage_card_job(uuid,text,text),public.reconcile_card_jobs() from public,anon;
grant execute on function public.manage_card_job(uuid,text,text),public.reconcile_card_jobs() to authenticated;
commit;
