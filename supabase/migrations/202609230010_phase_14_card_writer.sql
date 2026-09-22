begin;
create type public.card_write_job_status as enum ('QUEUED','LEASED','SUCCEEDED','FAILED','CANCELLED');
create table public.card_write_jobs (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), card_id uuid not null,
 status public.card_write_job_status not null default 'QUEUED', attempt_count integer not null default 0,max_attempts integer not null default 3,
 leased_by_device_id uuid,lease_token uuid,lease_expires_at timestamptz,idempotency_key uuid not null,
 last_error_code varchar(80),created_by uuid not null references public.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,
 unique(school_id,id),unique(school_id,idempotency_key),foreign key(school_id,card_id) references public.student_cards(school_id,id),foreign key(school_id,leased_by_device_id) references public.devices(school_id,id),
 check(attempt_count>=0 and max_attempts between 1 and 10),check((status='LEASED')=(lease_token is not null and lease_expires_at is not null and leased_by_device_id is not null))
);
create table public.card_write_logs (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),job_id uuid not null,device_id uuid not null,attempt integer not null,
 expected_rfid varchar(64) not null,observed_rfid varchar(64),expected_qr varchar(128) not null,observed_qr varchar(128),rfid_verified boolean not null,qr_verified boolean not null,
 success boolean not null,error_code varchar(80),created_at timestamptz not null default now(),
 foreign key(school_id,job_id) references public.card_write_jobs(school_id,id),foreign key(school_id,device_id) references public.devices(school_id,id)
);
create index card_write_jobs_queue_idx on public.card_write_jobs(school_id,status,created_at) where status in ('QUEUED','LEASED');
create index card_write_logs_job_idx on public.card_write_logs(school_id,job_id,created_at);
create trigger card_write_jobs_updated_at before update on public.card_write_jobs for each row execute function public.set_updated_at();
create function public.reject_card_write_log_mutation() returns trigger language plpgsql as $$ begin raise exception 'card write logs are immutable' using errcode='55000'; end $$;
create trigger card_write_logs_immutable before update or delete on public.card_write_logs for each row execute function public.reject_card_write_log_mutation();
alter table public.card_write_jobs enable row level security;alter table public.card_write_jobs force row level security;
alter table public.card_write_logs enable row level security;alter table public.card_write_logs force row level security;
create policy card_write_jobs_read on public.card_write_jobs for select to authenticated using(public.has_school_permission(school_id,'card.write'));
create policy card_write_jobs_create on public.card_write_jobs for insert to authenticated with check(public.has_school_permission(school_id,'card.write') and created_by=auth.uid());
create policy card_write_jobs_cancel on public.card_write_jobs for update to authenticated using(public.has_school_permission(school_id,'card.write')) with check(public.has_school_permission(school_id,'card.write'));
create policy card_write_logs_read on public.card_write_logs for select to authenticated using(public.has_school_permission(school_id,'card.write'));
grant select,insert,update on public.card_write_jobs to authenticated;grant select on public.card_write_logs to authenticated;

create function public.claim_card_write_job(target_device_id uuid,device_secret text,p_lease_seconds integer default 120) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;j public.card_write_jobs;c public.student_cards;s public.students;token uuid:=gen_random_uuid();
begin
 if p_lease_seconds not between 30 and 600 then raise exception 'invalid lease duration' using errcode='22023';end if;
 select dv into d from public.devices dv join public.device_credentials dc on dc.device_id=dv.id and dc.school_id=dv.school_id where dv.id=target_device_id and dv.device_type='CARD_STATION' and dv.status='ACTIVE' and dv.deleted_at is null and dc.secret_hash=encode(digest(device_secret,'sha256'),'hex') and dc.revoked_at is null and(dc.expires_at is null or dc.expires_at>now()) limit 1;
 if not found then raise exception 'invalid card station credential' using errcode='28000';end if;
 select * into j from public.card_write_jobs where school_id=d.school_id and attempt_count<max_attempts and(status='QUEUED' or(status='LEASED' and lease_expires_at<=now())) order by created_at for update skip locked limit 1;
 if not found then return jsonb_build_object('job',null);end if;
 update public.card_write_jobs set status='LEASED',attempt_count=attempt_count+1,leased_by_device_id=d.id,lease_token=token,lease_expires_at=now()+make_interval(secs=>p_lease_seconds) where id=j.id returning * into j;
 select * into c from public.student_cards where school_id=d.school_id and id=j.card_id;select * into s from public.students where school_id=d.school_id and id=c.student_id;
 return jsonb_build_object('job',jsonb_build_object('id',j.id,'lease_token',token,'lease_expires_at',j.lease_expires_at,'attempt',j.attempt_count,'student_id',s.id,'student_name',s.full_name,'expected_rfid',c.card_uid,'expected_qr',c.qr_key));
end $$;
create function public.complete_card_write_job(target_device_id uuid,device_secret text,p_job_id uuid,p_lease_token uuid,p_observed_rfid text,p_observed_qr text,p_retryable boolean default false,p_error_code text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;j public.card_write_jobs;c public.student_cards;rfid_ok boolean;qr_ok boolean;ok boolean;next_status public.card_write_job_status;
begin
 select dv into d from public.devices dv join public.device_credentials dc on dc.device_id=dv.id and dc.school_id=dv.school_id where dv.id=target_device_id and dv.device_type='CARD_STATION' and dv.status='ACTIVE' and dv.deleted_at is null and dc.secret_hash=encode(digest(device_secret,'sha256'),'hex') and dc.revoked_at is null and(dc.expires_at is null or dc.expires_at>now()) limit 1;
 if not found then raise exception 'invalid card station credential' using errcode='28000';end if;
 select * into j from public.card_write_jobs where id=p_job_id and school_id=d.school_id and status='LEASED' and leased_by_device_id=d.id and lease_token=p_lease_token and lease_expires_at>now() for update;
 if not found then raise exception 'invalid or expired job lease' using errcode='42501';end if;
 select * into c from public.student_cards where school_id=d.school_id and id=j.card_id;rfid_ok:=p_observed_rfid=c.card_uid;qr_ok:=p_observed_qr=c.qr_key;ok:=rfid_ok and qr_ok;
 -- Any read-back mismatch is a hard failure. Retryable transport failures are
 -- recovered by lease expiry before a completion result is submitted.
 next_status:=case when ok then 'SUCCEEDED'::public.card_write_job_status else 'FAILED'::public.card_write_job_status end;
 insert into public.card_write_logs(school_id,job_id,device_id,attempt,expected_rfid,observed_rfid,expected_qr,observed_qr,rfid_verified,qr_verified,success,error_code) values(d.school_id,j.id,d.id,j.attempt_count,c.card_uid,p_observed_rfid,c.qr_key,p_observed_qr,rfid_ok,qr_ok,ok,case when not rfid_ok then 'RFID_MISMATCH' when not qr_ok then 'QR_MISMATCH' else p_error_code end);
 update public.card_write_jobs set status=next_status,leased_by_device_id=null,lease_token=null,lease_expires_at=null,last_error_code=case when ok then null when not rfid_ok then 'RFID_MISMATCH' when not qr_ok then 'QR_MISMATCH' else p_error_code end,completed_at=case when next_status in('SUCCEEDED','FAILED') then now() else null end where id=j.id;
 return jsonb_build_object('job_id',j.id,'status',next_status,'rfid_verified',rfid_ok,'qr_verified',qr_ok);
end $$;
revoke all on function public.claim_card_write_job(uuid,text,integer),public.complete_card_write_job(uuid,text,uuid,uuid,text,text,boolean,text) from public,authenticated;
grant execute on function public.claim_card_write_job(uuid,text,integer),public.complete_card_write_job(uuid,text,uuid,uuid,text,text,boolean,text) to anon;
commit;
