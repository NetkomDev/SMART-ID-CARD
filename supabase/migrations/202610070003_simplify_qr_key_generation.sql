-- Migration: Simplify QR code payload generation & card station resolution
begin;

-- 1. Update create_card_batch RPC to generate short compact qr_key (NISN / Student Number / 10-char short hex)
create or replace function public.create_card_batch(
  p_id uuid,
  p_school uuid,
  p_students uuid[],
  p_class uuid default null,
  p_replaces uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare 
  s public.students;
  c public.classes;
  school public.schools;
  old_card public.student_cards;
  cid uuid;
  existing public.card_batches;
  derived_level text;
  v_qr_key text;
begin
  if not public.is_platform_admin() then 
    raise exception 'Platform authority required' using errcode='42501';
  end if;

  if p_students is null or cardinality(p_students) not between 1 and 200 or cardinality(p_students)<>(select count(distinct x) from unnest(p_students) x) then 
    raise exception 'Select 1 to 200 distinct students';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production:'||p_school::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));

  select * into existing from public.card_batches where id=p_id;
  if found then
    if existing.school_id<>p_school or existing.created_by<>auth.uid() or existing.class_id is distinct from p_class or (select array_agg(student_id order by student_id) from public.student_cards where batch_id=p_id) is distinct from (select array_agg(x order by x) from unnest(p_students)x) or exists(select 1 from public.student_cards where batch_id=p_id and replaces_card_id is distinct from p_replaces) then 
      raise exception 'Batch idempotency conflict';
    end if;
    return p_id;
  end if;

  select * into school from public.schools where id=p_school and is_active and status='ACTIVE' and deleted_at is null for update;
  if not found then 
    raise exception 'School is inactive';
  end if;

  derived_level := school.level;
  if school.name ilike '%SD%' or school.name ilike '%sekolah dasar%' or school.code ilike '%SD%' then
    derived_level := 'SD';
  elsif school.name ilike '%SMP%' or school.name ilike '%sekolah menengah pertama%' or school.code ilike '%SMP%' then
    derived_level := 'SMP';
  elsif school.name ilike '%SMA%' or school.name ilike '%SMK%' or school.code ilike '%SMA%' or school.code ilike '%SMK%' then
    derived_level := 'SMA';
  elsif derived_level is null then
    derived_level := 'SMA';
  end if;

  if p_class is not null then 
    select * into c from public.classes where id=p_class and school_id=p_school and is_active and deleted_at is null;
    if not found then 
      raise exception 'Invalid class';
    end if;
  end if;

  if p_replaces is not null then
    select * into old_card from public.student_cards where school_id=p_school and id=p_replaces for update;
    if not found or cardinality(p_students)<>1 or old_card.student_id<>p_students[1] or old_card.production_status not in ('VERIFIED','LEGACY') or old_card.status not in ('LOST','BLOCKED','EXPIRED') then 
      raise exception 'Block or mark the previous card lost before replacing it';
    end if;
  end if;

  insert into public.card_batches(id,school_id,class_id,academic_year_id,created_by) 
  values(p_id,p_school,p_class,c.academic_year_id,auth.uid());

  for s in select * from public.students where school_id=p_school and id=any(p_students) and is_active and deleted_at is null order by id for update loop
    if p_class is not null and not exists(select 1 from public.student_class_history where school_id=p_school and student_id=s.id and class_id=p_class and is_current) then 
      raise exception 'Student is not in selected class';
    end if;

    if s.photo_url is null or btrim(s.photo_url) = '' then
      raise exception 'Siswa % belum memiliki foto resmi yang diunggah dari PWA Orang Tua', s.full_name;
    end if;

    if exists(select 1 from public.student_cards where school_id=p_school and student_id=s.id and (status='ACTIVE' or production_status in ('DRAFT','PRINTED','READY_TO_WRITE','WRITING','FAILED'))) then 
      raise exception 'Student already has an active card or unfinished production';
    end if;

    cid := gen_random_uuid();
    
    -- Compact QR key: Prefer student NISN or student_number for short Version 1 QR code grid
    v_qr_key := coalesce(nullif(btrim(s.nisn), ''), nullif(btrim(s.student_number), ''), encode(extensions.gen_random_bytes(5), 'hex'));

    insert into public.student_cards(id,school_id,student_id,card_serial,qr_key,status,revoked_at,production_status,batch_id,replaces_card_id,print_snapshot)
    values(
      cid,p_school,s.id,'AKS-'||upper(replace(cid::text,'-','')),v_qr_key,'BLOCKED',now(),'DRAFT',p_id,p_replaces,
      jsonb_build_object(
        'student_name',s.full_name,
        'student_number',s.student_number,
        'school_name',school.name,
        'school_code',school.code,
        'school_logo_url',school.logo_url,
        'school_level',derived_level,
        'principal_name',school.principal_name,
        'principal_nip',school.principal_nip,
        'principal_signature_url',school.principal_signature_url,
        'photo_url',s.photo_url,
        'nisn',s.nisn,
        'gender',s.gender,
        'date_of_birth',s.date_of_birth,
        'address',s.address,
        'class_name',coalesce(c.name,(select cl.name from public.student_class_history h join public.classes cl on cl.id=h.class_id where h.school_id=p_school and h.student_id=s.id and h.is_current limit 1)),
        'template_version','aksis-v1'
      )
    );
  end loop;

  if (select count(*) from public.student_cards where batch_id=p_id)<>cardinality(p_students) then 
    raise exception 'Some students are inactive or belong to another school';
  end if;

  insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,after_data) values(p_school,auth.uid(),'CARD_BATCH_CREATED','card_batches',p_id,jsonb_build_object('count',cardinality(p_students),'class_id',p_class));
  return p_id;
end$$;

-- 2. Update claim_card_write_job and complete_card_write_job to support NISN, student_number & qr_key
create or replace function public.claim_card_write_job(target_device_id uuid,device_secret text,p_qr text,p_uid text,p_lease_seconds integer default 120) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;j public.card_write_jobs;c public.student_cards;token uuid:=gen_random_uuid();clean_qr text;begin
 d:=public.card_station(target_device_id,device_secret);
 perform pg_advisory_xact_lock(hashtextextended('production:'||d.school_id::text,0));
 if p_uid is null or p_qr is null or p_lease_seconds is null or p_lease_seconds not between 30 and 600 or p_uid !~ '^[0-9A-F]{8,20}$' then raise exception 'Invalid lease or chip UID';end if;
 perform public.reap_card_jobs(d.school_id);
 clean_qr := btrim(p_qr);
 select * into c from public.student_cards 
 where school_id=d.school_id 
   and (qr_key=clean_qr or print_snapshot->>'nisn'=clean_qr or print_snapshot->>'student_number'=clean_qr or card_serial=clean_qr) 
 order by (production_status in ('READY_TO_WRITE','WRITING')) desc, created_at desc
 limit 1;
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

create or replace function public.complete_card_write_job(target_device_id uuid,device_secret text,p_job_id uuid,p_lease_token uuid,p_observed_uid text,p_observed_rfid text,p_observed_qr text,p_retryable boolean default false,p_error_code text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;j public.card_write_jobs;c public.student_cards;rfid_ok boolean;qr_ok boolean;ok boolean;result jsonb;err text;next_status public.card_write_job_status;clean_obs_qr text;begin
 d:=public.card_station(target_device_id,device_secret);
 perform pg_advisory_xact_lock(hashtextextended('production:'||d.school_id::text,0));
 select sc.* into c from public.student_cards sc join public.card_write_jobs w on w.card_id=sc.id where w.id=p_job_id and w.school_id=d.school_id for update of sc;
 if not found then raise exception 'Job not found' using errcode='P0002';end if;
 select * into j from public.card_write_jobs where id=p_job_id for update;
 if j.completion_token=p_lease_token and j.completion_device_id=d.id then return j.completion_result;end if;
 if j.status<>'LEASED' or j.leased_by_device_id is distinct from d.id or j.lease_token is distinct from p_lease_token or j.lease_expires_at<=now() then raise exception 'Invalid or expired lease' using errcode='42501';end if;
 clean_obs_qr := btrim(p_observed_qr);
 rfid_ok:=coalesce((p_observed_rfid='AKS1:'||c.qr_key or p_observed_rfid=c.card_uid) and p_observed_uid=c.card_uid,false);
 qr_ok:=coalesce(clean_obs_qr=c.qr_key or clean_obs_qr=c.print_snapshot->>'nisn' or clean_obs_qr=c.print_snapshot->>'student_number',false);
 ok:=rfid_ok and qr_ok and p_error_code is null and c.production_status='WRITING' and c.status='BLOCKED' and (c.expires_at is not null and c.expires_at>now()) and exists(select 1 from public.students where id=c.student_id and is_active and deleted_at is null);
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

notify pgrst, 'reload schema';
commit;
