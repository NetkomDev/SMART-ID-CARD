begin;
-- Forward repair of the initial mobile attendance implementation. No printed QR secrets in payloads.
alter table public.attendance_logs alter column device_id drop not null;
alter table public.attendance_logs alter column card_id drop not null;
alter table public.attendance_logs add column if not exists notes text;
alter table public.attendance_logs add column if not exists scanner_name text;
alter table public.attendance_logs add column if not exists is_early_departure boolean not null default false;
alter table public.attendance_logs add column if not exists attendance_day date;

create or replace function public.provision_portal_access(p_actor_id uuid,p_school_id uuid,p_user_id uuid,p_token_hash text,p_email text,p_role_code text,p_metadata jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare role_id uuid; member_id uuid; token_id uuid; perm text; perm_id uuid; grants text[]; begin
 if not exists(select 1 from public.school_users su join public.users u on u.id=su.user_id join public.schools s on s.id=su.school_id
 join auth.users a on a.id=su.user_id
 join public.school_user_roles sur on sur.school_id=su.school_id and sur.school_user_id=su.id
 join public.roles r on r.school_id=sur.school_id and r.id=sur.role_id
 where su.user_id=p_actor_id and su.school_id=p_school_id and su.status='ACTIVE' and su.deleted_at is null
 and u.is_active and u.deleted_at is null and s.is_active and s.status='ACTIVE' and s.deleted_at is null
 and r.is_active and r.deleted_at is null and r.code='SCHOOL_ADMIN'
 and coalesce(a.raw_app_meta_data->>'platform_role','')<>'SUPER_ADMIN'
 and coalesce(a.raw_app_meta_data->>'portal_access','false')<>'true'
 and not exists(select 1 from public.qr_access_tokens where auth_user_id=p_actor_id)) then
  raise exception 'Admin sekolah aktif diperlukan' using errcode='42501';
 end if;
 if p_role_code not in ('WASTE_STAFF','LIBRARY_STAFF','TEACHER','PARENT','GATE_STAFF') then raise exception 'Portal tidak valid' using errcode='22023'; end if;
 if p_role_code='WASTE_STAFF' and not exists(select 1 from public.classes where school_id=p_school_id and id=(p_metadata->>'class_id')::uuid and deleted_at is null and is_active) then
  raise exception 'Kelas tidak ditemukan di sekolah ini' using errcode='22023'; end if;
 grants:=case p_role_code
  when 'WASTE_STAFF' then array['student.read','waste.create','waste.read']
  when 'LIBRARY_STAFF' then array['library.read','library.visit']
  when 'TEACHER' then array['student.read','extracurricular.read','extracurricular.manage','extracurricular.attendance']
  when 'GATE_STAFF' then array['student.read','attendance.read','attendance.scan']
  else array[]::text[] end;
 -- Dedicated roles keep portal access separate from administrator permissions.
 insert into public.roles(school_id,code,name,is_system) values(p_school_id,'PORTAL_'||p_role_code,'Portal '||p_role_code,true)
 on conflict(school_id,code) do update set is_active=true,deleted_at=null returning id into role_id;
 foreach perm in array grants loop
  insert into public.permissions(school_id,code,description) values(p_school_id,perm,'Portal: '||perm)
   on conflict(school_id,code) do update set is_active=true,deleted_at=null returning id into perm_id;
  insert into public.role_permissions(school_id,role_id,permission_id) values(p_school_id,role_id,perm_id) on conflict do nothing;
 end loop;
 insert into public.users(id,full_name,is_active) values(p_user_id,'Portal '||p_role_code,true) on conflict(id) do nothing;
 insert into public.school_users(school_id,user_id,status,joined_at) values(p_school_id,p_user_id,'ACTIVE',now()) returning id into member_id;
 insert into public.school_user_roles(school_id,school_user_id,role_id,assigned_by) values(p_school_id,member_id,role_id,p_actor_id);
 insert into public.qr_access_tokens(school_id,token_hash,auth_user_id,shadow_email,role_code,metadata,created_by)
  values(p_school_id,p_token_hash,p_user_id,p_email,p_role_code,p_metadata,p_actor_id) returning id into token_id;
 if p_role_code='PARENT' then
  -- We just create the profile, we do not link any students yet
  insert into public.parent_profiles(user_id,full_name) values(p_user_id,'Orang Tua');
 end if;
 return token_id;
end $$;

revoke all on function public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.provision_portal_access(uuid,uuid,uuid,text,text,text,jsonb) to service_role;

-- Repair any already provisioned gate role without widening other portal roles.
delete from public.role_permissions rp using public.roles r,public.permissions p
 where rp.role_id=r.id and rp.school_id=r.school_id and rp.permission_id=p.id and p.school_id=rp.school_id
 and r.code='PORTAL_GATE_STAFF' and p.code not in ('student.read','attendance.read','attendance.scan');
insert into public.permissions(school_id,code,description)
 select distinct r.school_id,perm,'Portal: '||perm from public.roles r cross join unnest(array['student.read','attendance.read','attendance.scan']) perm where r.code='PORTAL_GATE_STAFF'
 on conflict(school_id,code) do update set is_active=true,deleted_at=null;
insert into public.role_permissions(school_id,role_id,permission_id)
 select r.school_id,r.id,p.id from public.roles r join public.permissions p on p.school_id=r.school_id and p.code in ('student.read','attendance.read','attendance.scan') where r.code='PORTAL_GATE_STAFF' on conflict do nothing;

-- Preserve full original duplicate rows before canonicalizing historical data.
create table public.attendance_legacy_archive(log_id uuid primary key,school_id uuid not null,canonical_log_id uuid not null,log_data jsonb not null,archived_at timestamptz not null default now());
alter table public.attendance_legacy_archive enable row level security;
revoke all on public.attendance_legacy_archive from public,anon,authenticated;
create temporary table attendance_merge_map on commit drop as
 select id as duplicate_id,canonical_id from (
 select l.id,first_value(l.id) over(partition by l.school_id,l.student_id,(l.occurred_at_local at time zone sc.timezone)::date,l.direction order by l.occurred_at_local,l.event_id) as canonical_id,
 row_number() over(partition by l.school_id,l.student_id,(l.occurred_at_local at time zone sc.timezone)::date,l.direction order by l.occurred_at_local,l.event_id) as position
 from public.attendance_logs l join public.schools sc on sc.id=l.school_id) ranked where position>1;
insert into public.attendance_legacy_archive(log_id,school_id,canonical_log_id,log_data)
 select l.id,l.school_id,m.canonical_id,to_jsonb(l) from public.attendance_logs l join attendance_merge_map m on m.duplicate_id=l.id;
update public.attendance_event_receipts r set attendance_id=m.canonical_id,result=r.result||jsonb_build_object('attendance_id',m.canonical_id,'canonicalized',true)
 from attendance_merge_map m where r.attendance_id=m.duplicate_id;
delete from public.attendance_logs l using attendance_merge_map m where l.id=m.duplicate_id;
update public.attendance_logs l set attendance_day=(l.occurred_at_local at time zone s.timezone)::date from public.schools s where s.id=l.school_id;
alter table public.attendance_logs alter column attendance_day set not null;
create unique index attendance_school_student_day_direction on public.attendance_logs(school_id,student_id,attendance_day,direction);
create function public.set_attendance_day() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin new.attendance_day:=(new.occurred_at_local at time zone (select timezone from public.schools where id=new.school_id))::date;return new;end $$;
create trigger attendance_log_school_day before insert or update on public.attendance_logs for each row execute function public.set_attendance_day();
revoke all on function public.set_attendance_day() from public,anon,authenticated;

create table public.attendance_rule_versions(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 effective_at timestamptz not null,entry_start time not null,on_time_until time not null,checkout_start time not null,created_by uuid references public.users(id),
 check(entry_start<=on_time_until and on_time_until<checkout_start));
alter table public.attendance_rule_versions enable row level security;
revoke all on public.attendance_rule_versions from public,anon,authenticated;
create index attendance_rule_versions_lookup on public.attendance_rule_versions(school_id,effective_at desc);
create index attendance_rules_effective on public.attendance_rule_versions(school_id,effective_at desc,id desc);
insert into public.attendance_rule_versions(school_id,effective_at,entry_start,on_time_until,checkout_start)
 select sc.id,'-infinity',coalesce(r.entry_start,'06:30'),coalesce(r.on_time_until,'07:30'),coalesce(r.checkout_start,'14:00')
 from public.schools sc left join public.attendance_rules r on r.school_id=sc.id and r.device_id is null and r.is_active and r.deleted_at is null;

create function public.can_scan_school_attendance(p_school uuid) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and public.portal_session_active() and public.has_school_access(p_school)
 and (public.has_school_permission(p_school,'attendance.scan') or public.can_manage_portal_access(p_school));
$$;
revoke all on function public.can_scan_school_attendance(uuid) from public,anon;
grant execute on function public.can_scan_school_attendance(uuid) to authenticated;

create function public.get_school_attendance_settings(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.attendance_rule_versions;tz text;
begin
 if not public.has_school_access(p_school) or not public.portal_session_active() or not (public.has_school_permission(p_school,'attendance.read') or public.can_scan_school_attendance(p_school)) then raise exception 'Attendance access denied' using errcode='42501';end if;
 select timezone into tz from public.schools where id=p_school;
 select * into r from public.attendance_rule_versions where school_id=p_school order by effective_at desc,id desc limit 1;
 return jsonb_build_object('school_id',p_school,'version',r.id,'check_in_start',to_char(coalesce(r.entry_start,'06:30'),'HH24:MI'),'check_in_end',to_char(coalesce(r.on_time_until,'07:30'),'HH24:MI'),'check_out_start',to_char(coalesce(r.checkout_start,'14:00'),'HH24:MI'),'timezone',tz,'server_time',clock_timestamp());
end $$;
revoke all on function public.get_school_attendance_settings(uuid) from public,anon;
grant execute on function public.get_school_attendance_settings(uuid) to authenticated;
create or replace function public.get_or_create_school_attendance_rules(p_school_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$select public.get_school_attendance_settings(p_school_id)$$;
revoke all on function public.get_or_create_school_attendance_rules(uuid) from public,anon;
grant execute on function public.get_or_create_school_attendance_rules(uuid) to authenticated;

create or replace function public.update_school_attendance_rules(p_school_id uuid,p_entry_start time,p_on_time_until time,p_checkout_start time) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.can_manage_portal_access(p_school_id) then raise exception 'School admin required' using errcode='42501';end if;
 if p_entry_start is null or p_on_time_until is null or p_checkout_start is null or p_entry_start>p_on_time_until or p_on_time_until>=p_checkout_start then raise exception 'Urutan jam presensi tidak valid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('attendance-rules:'||p_school_id,0));
 if not exists(select 1 from public.attendance_rule_versions where school_id=p_school_id) then
 insert into public.attendance_rule_versions(school_id,effective_at,entry_start,on_time_until,checkout_start) values(p_school_id,'-infinity','06:30','07:30','14:00');end if;
 insert into public.attendance_rule_versions(school_id,effective_at,entry_start,on_time_until,checkout_start,created_by) values(p_school_id,clock_timestamp(),p_entry_start,p_on_time_until,p_checkout_start,auth.uid());
 insert into public.attendance_rules(school_id,name,mode,entry_start,on_time_until,checkout_start) values(p_school_id,'Jam presensi sekolah','AUTO',p_entry_start,p_on_time_until,p_checkout_start)
 on conflict(school_id) where device_id is null and is_active and deleted_at is null do update set entry_start=excluded.entry_start,on_time_until=excluded.on_time_until,checkout_start=excluded.checkout_start;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id) values(p_school_id,auth.uid(),'attendance.rules.updated','school',p_school_id);
 delete from public.dashboard_daily_snapshots where school_id=p_school_id;
 return public.get_school_attendance_settings(p_school_id);
end $$;
revoke all on function public.update_school_attendance_rules(uuid,time,time,time) from public,anon;
grant execute on function public.update_school_attendance_rules(uuid,time,time,time) to authenticated;

create table public.attendance_scan_events(
 school_id uuid not null references public.schools(id),event_id uuid not null,device_id uuid not null,actor_user_id uuid not null references public.users(id),
 identifier text not null,direction public.attendance_direction not null,occurred_at timestamptz not null,notes text,scanner_name text not null,
 student_id uuid not null,attendance_id uuid references public.attendance_logs(id),outcome text not null,
 received_at timestamptz not null default now(),primary key(school_id,event_id),
 foreign key(school_id,student_id) references public.students(school_id,id),
 check(outcome in ('ACCEPTED','REPLACED','DUPLICATE','NEEDS_REASON')),check(length(coalesce(notes,''))<=500),check(length(scanner_name) between 1 and 100));
alter table public.attendance_scan_events enable row level security;
revoke all on public.attendance_scan_events from public,anon,authenticated;
create index attendance_scan_student_time on public.attendance_scan_events(school_id,student_id,occurred_at);

create function public.attendance_scanner_bootstrap(p_school uuid,p_after uuid default null,p_limit integer default 500) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare roster jsonb;last_id uuid;tz text;today date;total integer;
begin
 if not public.can_scan_school_attendance(p_school) then raise exception 'Scanner access denied' using errcode='42501';end if;
 if p_limit not between 1 and 500 then raise exception 'Invalid page size' using errcode='22023';end if;
 select timezone into tz from public.schools where id=p_school;today:=(now() at time zone tz)::date;
 select coalesce(jsonb_agg(to_jsonb(page) order by page.id),'[]'::jsonb) into roster from (
 select s.id,s.full_name,s.student_number,s.nisn,
 (select c.name from public.student_class_history h join public.classes c on c.school_id=h.school_id and c.id=h.class_id where h.school_id=p_school and h.student_id=s.id and h.is_current limit 1) as class_name,
 coalesce((select jsonb_agg(jsonb_build_object('qr_key',c.qr_key,'card_uid',c.card_uid,'card_serial',c.card_serial,'expires_at',c.expires_at)) from public.student_cards c where c.school_id=p_school and c.student_id=s.id and c.status='ACTIVE' and (c.expires_at is null or c.expires_at>now())),'[]'::jsonb) as cards
 from public.students s where s.school_id=p_school and s.is_active and s.deleted_at is null and (p_after is null or s.id>p_after) order by s.id limit p_limit) page;
 total:=jsonb_array_length(roster);if total=p_limit then last_id:=(roster->(total-1)->>'id')::uuid;end if;
 return jsonb_build_object('school_id',p_school,'server_time',clock_timestamp(),'rules',public.get_school_attendance_settings(p_school),'students',roster,'next_cursor',last_id,
 'today',case when p_after is null then (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'direction',direction,'occurred_at',occurred_at_local,'is_late',is_late,'is_early_departure',is_early_departure,'notes',notes,'scanner_name',scanner_name)),'[]'::jsonb) from public.attendance_logs where school_id=p_school and attendance_day=today) else '[]'::jsonb end);
end $$;
revoke all on function public.attendance_scanner_bootstrap(uuid,uuid,integer) from public,anon;
grant execute on function public.attendance_scanner_bootstrap(uuid,uuid,integer) to authenticated;

create function public.attendance_scanner_state(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare tz text;today date;
begin
 if not public.can_scan_school_attendance(p_school) then raise exception 'Scanner access denied' using errcode='42501';end if;
 select timezone into tz from public.schools where id=p_school;today:=(now() at time zone tz)::date;
 return jsonb_build_object('school_id',p_school,'server_time',clock_timestamp(),'rules',public.get_school_attendance_settings(p_school),'today',
 (select coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'direction',direction,'occurred_at',occurred_at_local,'is_late',is_late,'is_early_departure',is_early_departure,'notes',notes,'scanner_name',scanner_name)),'[]'::jsonb) from public.attendance_logs where school_id=p_school and attendance_day=today));
end $$;
revoke all on function public.attendance_scanner_state(uuid) from public,anon;
grant execute on function public.attendance_scanner_state(uuid) to authenticated;

create function public.apply_attendance_scan(p_school uuid,p_scan jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare eid uuid;did uuid;at_time timestamptz;dir public.attendance_direction;ident text;note text;operator_name text;
 ids uuid[];sid uuid;tz text;day date;classid uuid;cardid uuid;rule public.attendance_rule_versions;
 prior public.attendance_scan_events;official public.attendance_logs;late boolean;early boolean;outcome text;canonical jsonb;
begin
 eid:=(p_scan->>'event_id')::uuid;did:=(p_scan->>'device_id')::uuid;at_time:=(p_scan->>'occurred_at')::timestamptz;dir:=(p_scan->>'direction')::public.attendance_direction;
 ident:=btrim(p_scan->>'identifier');note:=nullif(btrim(p_scan->>'notes'),'');operator_name:=btrim(p_scan->>'scanner_name');
 if eid is null or did is null or at_time is null or dir is null or coalesce(length(ident),0) not between 1 and 128 or coalesce(length(operator_name),0) not between 1 and 100 or length(coalesce(note,''))>500 then
 return jsonb_build_object('event_id',eid,'status','REJECTED','code','INVALID_SCAN','message','Data scan tidak lengkap.');end if;
 if at_time>clock_timestamp()+interval '5 minutes' or at_time<clock_timestamp()-interval '30 days' then
 return jsonb_build_object('event_id',eid,'status','REJECTED','code','CLOCK_OUT_OF_RANGE','message','Waktu scan perlu diperiksa oleh admin.');end if;
 select timezone into tz from public.schools where id=p_school;day:=(at_time at time zone tz)::date;
 select array_agg(id) into ids from (
 select s.id from public.students s where s.school_id=p_school and s.is_active and s.deleted_at is null and (
 s.id::text=ident or s.nisn=ident or s.student_number=ident or exists(select 1 from public.student_cards c where c.school_id=p_school and c.student_id=s.id and c.status='ACTIVE' and (c.expires_at is null or c.expires_at>at_time)
 and (lower(c.qr_key)=lower(ident) or upper(c.card_uid)=upper(ident) or upper(c.card_serial)=upper(ident)))) limit 2) candidates;
 if coalesce(array_length(ids,1),0)<>1 then return jsonb_build_object('event_id',eid,'status','REJECTED','code','STUDENT_NOT_FOUND','message','Identitas tidak valid atau ambigu pada sekolah ini.');end if;
 sid:=ids[1];
 select * into prior from public.attendance_scan_events where school_id=p_school and event_id=eid for update;
 if found and (prior.student_id<>sid or prior.identifier<>ident or prior.device_id<>did or prior.actor_user_id<>auth.uid() or prior.direction<>dir or prior.occurred_at<>at_time or (prior.outcome<>'NEEDS_REASON' and (prior.notes is distinct from note or prior.scanner_name<>operator_name))) then
 return jsonb_build_object('event_id',eid,'status','REJECTED','code','EVENT_ID_CONFLICT','message','ID scan telah digunakan untuk data berbeda.');end if;
 select * into rule from public.attendance_rule_versions where school_id=p_school and effective_at<=at_time order by effective_at desc,id desc limit 1;
 -- HH:MM boundaries include the complete arrival cutoff minute.
 late:=dir='CHECK_IN' and to_char(at_time at time zone tz,'HH24:MI')>to_char(coalesce(rule.on_time_until,'07:30'),'HH24:MI');
 early:=dir='CHECK_OUT' and to_char(at_time at time zone tz,'HH24:MI')<to_char(coalesce(rule.checkout_start,'14:00'),'HH24:MI');
 select * into official from public.attendance_logs where school_id=p_school and student_id=sid and attendance_day=day and direction=dir for update;
 if official.id is not null and (at_time>official.occurred_at_local or (at_time=official.occurred_at_local and eid>=official.event_id)) then
 outcome:=case when official.event_id=eid then coalesce(nullif(prior.outcome,'NEEDS_REASON'),'ACCEPTED') else 'DUPLICATE' end;
 elsif (late or early) and note is null then outcome:='NEEDS_REASON';
 else
 select h.class_id into classid from public.student_class_history h where h.school_id=p_school and h.student_id=sid and h.start_date<=day and (h.end_date is null or h.end_date>=day) order by h.start_date desc,h.id limit 1;
 select c.id into cardid from public.student_cards c where c.school_id=p_school and c.student_id=sid and c.status='ACTIVE' and (c.expires_at is null or c.expires_at>at_time) order by c.created_at desc,c.id limit 1;
 if official.id is null then
 insert into public.attendance_logs(event_id,school_id,device_id,student_id,card_id,class_id,direction,source,occurred_at_local,local_sequence,is_late,is_early_departure,notes,scanner_name,metadata)
 values(eid,p_school,null,sid,cardid,classid,dir,'OFFLINE_SYNC',at_time,0,late,early,note,operator_name,jsonb_build_object('device_id',did,'actor_user_id',auth.uid(),'rule_version',rule.id)) returning * into official;outcome:='ACCEPTED';
 else
 update public.attendance_logs set event_id=eid,occurred_at_local=at_time,class_id=classid,card_id=cardid,is_late=late,is_early_departure=early,notes=note,scanner_name=operator_name,
 metadata=metadata||jsonb_build_object('device_id',did,'actor_user_id',auth.uid(),'rule_version',rule.id,'corrected_at',clock_timestamp()) where id=official.id returning * into official;outcome:='REPLACED';
 update public.attendance_scan_events set outcome='DUPLICATE' where school_id=p_school and attendance_id=official.id and occurred_at>=at_time and event_id<>eid;
 end if;
 delete from public.dashboard_daily_snapshots where school_id=p_school and metric_date=day;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id) values(p_school,auth.uid(),'attendance.'||lower(outcome),'attendance',official.id);
 end if;
 insert into public.attendance_scan_events(school_id,event_id,device_id,actor_user_id,identifier,direction,occurred_at,notes,scanner_name,student_id,attendance_id,outcome)
 values(p_school,eid,did,auth.uid(),ident,dir,at_time,note,operator_name,sid,official.id,outcome)
 on conflict(school_id,event_id) do update set notes=excluded.notes,scanner_name=excluded.scanner_name,attendance_id=excluded.attendance_id,outcome=excluded.outcome;
 if official.id is not null then canonical:=jsonb_build_object('attendance_id',official.id,'event_id',official.event_id,'student_id',sid,'direction',dir,'occurred_at',official.occurred_at_local,'is_late',official.is_late,'is_early_departure',official.is_early_departure,'notes',official.notes,'scanner_name',official.scanner_name);end if;
 return jsonb_build_object('event_id',eid,'status',outcome,'student_id',sid,'student_name',(select full_name from public.students where id=sid),'canonical',canonical,'is_late',late,'is_early_departure',early,'code',case when outcome='NEEDS_REASON' then 'REASON_REQUIRED' end);
end $$;
revoke all on function public.apply_attendance_scan(uuid,jsonb) from public,anon,authenticated;

create function public.sync_school_attendance(p_school uuid,p_scans jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare item jsonb;result jsonb;results jsonb:='[]';
begin
 if not public.can_scan_school_attendance(p_school) then raise exception 'Scanner access denied' using errcode='42501';end if;
 if jsonb_typeof(p_scans)<>'array' or jsonb_array_length(p_scans) not between 1 and 50 then raise exception 'Invalid attendance batch' using errcode='22023';end if;
 -- A short school-scoped transaction avoids alias-related multi-student deadlocks across phones.
 perform pg_advisory_xact_lock(hashtextextended('attendance-sync:'||p_school,0));
 for item in select value from jsonb_array_elements(p_scans) loop
 begin result:=public.apply_attendance_scan(p_school,item);
 exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then result:=jsonb_build_object('event_id',item->>'event_id','status','REJECTED','code','INVALID_SCAN','message','Format scan tidak valid.');end;
 results:=results||jsonb_build_array(result);
 end loop;
 return jsonb_build_object('school_id',p_school,'server_time',clock_timestamp(),'results',results);
end $$;
revoke all on function public.sync_school_attendance(uuid,jsonb) from public,anon;
grant execute on function public.sync_school_attendance(uuid,jsonb) to authenticated;

create function public.attendance_school_summary(p_school uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare today date;tz text;result jsonb;
begin
 if not public.has_school_permission(p_school,'attendance.read') or not public.portal_session_active() then raise exception 'Attendance access denied' using errcode='42501';end if;
 select timezone into tz from public.schools where id=p_school;today:=(now() at time zone tz)::date;
 select jsonb_build_object('date',today,'timezone',tz,'total_present',count(*) filter(where direction='CHECK_IN'),'total_late',count(*) filter(where direction='CHECK_IN' and is_late),'total_checkout',count(*) filter(where direction='CHECK_OUT'),'early_departures',count(*) filter(where direction='CHECK_OUT' and is_early_departure)) into result from public.attendance_logs where school_id=p_school and attendance_day=today;
 return result;
end $$;
revoke all on function public.attendance_school_summary(uuid) from public,anon;
grant execute on function public.attendance_school_summary(uuid) to authenticated;

-- Deprecated token-hash APIs cannot bypass the authenticated tenant boundary.
revoke all on function public.ingest_pwa_attendance_scan(text,uuid,text,public.attendance_direction,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.sync_pwa_attendance_batch(text,jsonb) from public,anon,authenticated;

create or replace function public.portal_student_allowed(target_school_id uuid,target_student_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from public.qr_access_tokens where auth_user_id=auth.uid()) or exists(
  select 1 from public.qr_access_tokens q where q.auth_user_id=auth.uid() and q.school_id=target_school_id and (
   (q.role_code='PARENT' and exists(
      select 1 from public.parent_student_links psl 
      where psl.parent_user_id=q.auth_user_id 
        and psl.student_id=target_student_id 
        and psl.status='ACTIVE'
   )) or
   (q.role_code='WASTE_STAFF' and exists(select 1 from public.student_class_history h where h.school_id=target_school_id
    and h.student_id=target_student_id and h.is_current and h.class_id::text=q.metadata->>'class_id')) or
   q.role_code in ('TEACHER','LIBRARY_STAFF','GATE_STAFF')
  )
 );
$$;

create or replace function public.portal_class_allowed(target_school_id uuid,target_class_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select not exists(select 1 from public.qr_access_tokens where auth_user_id=auth.uid()) or exists(
  select 1 from public.qr_access_tokens where auth_user_id=auth.uid() and school_id=target_school_id
   and (role_code<>'WASTE_STAFF' or metadata->>'class_id'=target_class_id::text)
 );
$$;

create or replace function public.parent_today_base_v4(target_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare
  link_row public.parent_student_links;
  tz text;
  student_rec record;
  att_record record;
  waste_record record;
  library_record record;
  all_events jsonb;
  activities jsonb;
  permit_reason text;
  day_start timestamptz;
  day_end timestamptz;
  month_start timestamptz;
  month_end timestamptz;
begin
  if not public.can_access_parent_child(target_student_id) then raise exception 'Child access denied' using errcode='42501'; end if;
  select * into link_row from public.parent_student_links
  where parent_user_id = auth.uid()
    and verified_at is not null
    and student_id = target_student_id
    and status = 'ACTIVE';
  if not found then raise exception 'child relationship not found' using errcode = 'AP002'; end if;

  select timezone into tz from public.schools where id = link_row.school_id;
  if tz is null then tz := 'Asia/Makassar'; end if;
  day_start := date_trunc('day', now() at time zone tz) at time zone tz;
  day_end := (date_trunc('day', now() at time zone tz) + interval '1 day') at time zone tz;
  month_start := date_trunc('month', now() at time zone tz) at time zone tz;
  month_end := (date_trunc('month', now() at time zone tz) + interval '1 month') at time zone tz;

  -- 1. Student details
  select s.id, s.full_name, s.student_number, s.photo_url, sc.name as school_name, coalesce(c.name, 'Belum ada kelas') as class_name
  into student_rec
  from public.students s
  join public.schools sc on sc.id = s.school_id
  left join public.student_class_history h on h.school_id = s.school_id and h.student_id = s.id and h.is_current
  left join public.classes c on c.school_id = h.school_id and c.id = h.class_id
  where s.id = target_student_id and s.school_id = link_row.school_id
    and s.is_active and s.deleted_at is null;
  if not found then raise exception 'child relationship not found' using errcode='AP002'; end if;

  select reason::text into permit_reason from public.student_absence_permits where school_id=link_row.school_id and student_id=target_student_id and permit_date=(now() at time zone tz)::date;

  -- 2. Today's Attendance summary
  select
    to_char(min(occurred_at_local) filter (where direction = 'CHECK_IN') at time zone tz, 'HH24.MI') as check_in,
    to_char(max(occurred_at_local) filter (where direction = 'CHECK_OUT') at time zone tz, 'HH24.MI') as check_out,
    bool_or(is_late) filter (where direction = 'CHECK_IN') as is_late
  into att_record
  from public.attendance_logs
  where school_id = link_row.school_id and student_id = target_student_id
    and occurred_at_local >= day_start and occurred_at_local < day_end;

  -- 3. Waste summary
  select
    coalesce(sum(total_kg) filter (where created_at >= day_start and created_at < day_end), 0) as today_kg,
    coalesce(sum(points_earned), 0) as total_points,
    coalesce(sum(points_earned) filter (where created_at >= day_start and created_at < day_end), 0) as today_points,
    count(*) filter (where points_earned is null) as unscored
  into waste_record
  from public.waste_transactions
  where school_id = link_row.school_id and student_id = target_student_id;

  -- 4. Library summary
  select
    count(*) filter (where occurred_at >= day_start and occurred_at < day_end) as today_visits,
    count(*) filter (where occurred_at >= month_start and occurred_at < month_end) as month_visits
  into library_record
  from public.library_visits
  where school_id = link_row.school_id and student_id = target_student_id;

  -- Use the session date, never the date an administrator entered attendance.
  -- Include every active membership's non-cancelled session for today.
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', e.name,
    'status', case a.status when 'PRESENT' then 'HADIR' when 'EXCUSED' then 'IZIN'
      when 'ABSENT' then 'ALPA' else 'BELUM_HADIR' end,
    'schedule', to_char(es.starts_at at time zone tz, 'HH24.MI') || ' – ' || to_char(es.ends_at at time zone tz, 'HH24.MI'),
    'time_attended', coalesce(to_char(a.recorded_at at time zone tz, 'HH24.MI'), '—')
  ) order by es.starts_at, es.id), '[]'::jsonb) into activities
  from public.extracurricular_members m
  join public.extracurriculars e on e.school_id=m.school_id and e.id=m.extracurricular_id
  join public.extracurricular_sessions es on es.school_id=e.school_id and es.extracurricular_id=e.id
  left join public.extracurricular_attendance a on a.school_id=es.school_id and a.session_id=es.id and a.student_id=m.student_id
  where m.school_id=link_row.school_id and m.student_id=target_student_id and m.status='ACTIVE'
    and e.is_active and e.deleted_at is null and es.status <> 'CANCELLED'
    and es.starts_at >= day_start and es.starts_at < day_end;

  -- 6. Events timeline
  with today_attendance as (
    select id, case direction when 'CHECK_IN' then 'attendance.check_in' else 'attendance.check_out' end as type,
    occurred_at_local as occurred_at, is_late, null::text as extra_info
    from public.attendance_logs
    where school_id = link_row.school_id and student_id = target_student_id
      and occurred_at_local >= day_start and occurred_at_local < day_end
  ),
  today_waste as (
    select id, 'waste.transaction' as type,
    created_at as occurred_at, false as is_late, ('Setoran ' || total_kg::text || ' kg') as extra_info
    from public.waste_transactions
    where school_id = link_row.school_id and student_id = target_student_id
      and created_at >= day_start and created_at < day_end
  ),
  today_library as (
    select id, 'library.visit' as type,
    occurred_at as occurred_at, false as is_late, 'Kunjungan Perpustakaan' as extra_info
    from public.library_visits
    where school_id = link_row.school_id and student_id = target_student_id
      and occurred_at >= day_start and occurred_at < day_end
  ),
  today_ekskul as (
    select es.id, 'extracurricular.attendance' as type,
    es.starts_at as occurred_at, false as is_late,
    e.name || ' · ' || case a.status when 'PRESENT' then 'Hadir' when 'EXCUSED' then 'Izin'
      when 'ABSENT' then 'Tidak hadir' else 'Belum presensi' end || ' · ' ||
      to_char(es.starts_at at time zone tz, 'HH24.MI') || ' – ' || to_char(es.ends_at at time zone tz, 'HH24.MI') as extra_info
    from public.extracurricular_members m
    join public.extracurriculars e on e.school_id=m.school_id and e.id=m.extracurricular_id
    join public.extracurricular_sessions es on es.school_id=e.school_id and es.extracurricular_id=e.id
    left join public.extracurricular_attendance a on a.school_id=es.school_id and a.session_id=es.id and a.student_id=m.student_id
    where m.school_id=link_row.school_id and m.student_id=target_student_id and m.status='ACTIVE'
      and e.is_active and e.deleted_at is null and es.status <> 'CANCELLED'
      and es.starts_at >= day_start and es.starts_at < day_end
  ),
  combined_events as (
    select * from today_attendance
    union all select * from today_waste
    union all select * from today_library
    union all select * from today_ekskul
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'type', type, 'occurred_at', occurred_at, 'is_late', is_late, 'extra_info', extra_info
  ) order by occurred_at desc), '[]'::jsonb) into all_events
  from combined_events;

  return jsonb_build_object(
    'contract_version', 2,
    'student_id', target_student_id,
    'timezone', tz,
    'as_of', now(),
    'profile', jsonb_build_object(
      'full_name', coalesce(student_rec.full_name, 'Siswa'),
      'first_name', split_part(coalesce(student_rec.full_name, 'Siswa'), ' ', 1),
      'school_name', coalesce(student_rec.school_name, 'Sekolah'),
      'class_name', coalesce(student_rec.class_name, 'Belum ada kelas'),
      'photo_url', student_rec.photo_url
    ),
    'attendance', jsonb_build_object(
      'status', case
        when att_record.check_out is not null then 'PULANG'
        when att_record.check_in is not null and att_record.is_late then 'TERLAMBAT'
        when att_record.check_in is not null then 'HADIR'
        when permit_reason is not null then permit_reason
        else 'BELUM_HADIR' end,
      'check_in', coalesce(att_record.check_in, '—'),
      'check_out', coalesce(att_record.check_out, '—')
    ),
    'waste', jsonb_build_object(
      'today_kg', coalesce(waste_record.today_kg, 0),
      'total_points', coalesce(waste_record.total_points, 0),
      'today_points', coalesce(waste_record.today_points, 0),
      'unscored', waste_record.unscored
    ),
    'library', jsonb_build_object(
      'today_visits', coalesce(library_record.today_visits, 0),
      'month_visits', coalesce(library_record.month_visits, 0)
    ),
    'extracurricular', coalesce(activities->0, jsonb_build_object(
      'name', 'Tidak ada kegiatan hari ini', 'status', 'TIDAK_ADA', 'time_attended', '—', 'schedule', null
    )) || jsonb_build_object('activities_count', jsonb_array_length(activities)),
    'extracurriculars', activities,
    'events', all_events
  );
end;
$$;

revoke all on function public.parent_today_base_v4(uuid) from public,anon,authenticated;

create or replace function public.get_verified_parent_child_today(target_student_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare doc jsonb;tz text;today date;arrival public.attendance_logs;departure public.attendance_logs;att jsonb;notice text;
begin
 doc:=public.parent_today_base_v4(target_student_id);tz:=doc->>'timezone';today:=(now() at time zone tz)::date;
 select * into arrival from public.attendance_logs where student_id=target_student_id and attendance_day=today and direction='CHECK_IN' order by occurred_at_local,event_id limit 1;
 select * into departure from public.attendance_logs where student_id=target_student_id and attendance_day=today and direction='CHECK_OUT' order by occurred_at_local,event_id limit 1;
 notice:=nullif(concat_ws(' · ',case when arrival.is_late then 'Hari ini Terlambat' end,case when departure.is_early_departure then 'Hari ini Pulang Cepat' end),'');
 att:=(doc->'attendance')||jsonb_build_object('check_in',coalesce(to_char(arrival.occurred_at_local at time zone tz,'HH24.MI'),'—'),'check_out',coalesce(to_char(departure.occurred_at_local at time zone tz,'HH24.MI'),'—'),'is_late',coalesce(arrival.is_late,false),'is_early_departure',coalesce(departure.is_early_departure,false),'check_in_note',arrival.notes,'check_out_note',departure.notes,'note',notice);
 return doc||jsonb_build_object('contract_version',4,'attendance',att);
end $$;
revoke all on function public.get_verified_parent_child_today(uuid) from public,anon;
grant execute on function public.get_verified_parent_child_today(uuid) to authenticated;

create or replace function public.refresh_dashboard_today(target_school_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  tz text;
  local_date date;
  day_start timestamptz;
  day_end timestamptz;
  payload jsonb;
  snapshot public.dashboard_daily_snapshots;
  total_students integer;
  sick_count integer;
  permit_count integer;
begin
  if not public.has_school_permission(target_school_id,'dashboard.read') then raise exception 'dashboard access denied' using errcode='42501'; end if;
  select timezone into tz from public.schools where id=target_school_id and status='ACTIVE' and is_active and deleted_at is null;
  if not found then raise exception 'school not found' using errcode='P0002'; end if;
  
  local_date := (now() at time zone tz)::date;
  day_start := local_date::timestamp at time zone tz;
  day_end := (local_date+1)::timestamp at time zone tz;

  select count(*) into total_students from public.students where school_id = target_school_id and is_active and deleted_at is null;

  select count(distinct student_id) into sick_count
  from public.student_absence_permits
  where school_id = target_school_id and permit_date = local_date and reason = 'SAKIT';

  select count(distinct student_id) into permit_count
  from public.student_absence_permits
  where school_id = target_school_id and permit_date = local_date and reason in ('IZIN', 'ALASAN_LAIN');

  select jsonb_build_object(
    'attendance', jsonb_build_object(
      'total', coalesce(total_students, 500),
      'late', count(*) filter(where direction='CHECK_IN' and is_late),
      'students', count(distinct student_id) filter(where direction='CHECK_IN'),
      'sick', coalesce(sick_count, 0),
      'permit', coalesce(permit_count, 0)
    ),
    'waste', jsonb_build_object(
      'transactions', (select count(*) from public.waste_transactions where school_id=target_school_id and created_at>=day_start and created_at<day_end),
      'total_kg', coalesce((select sum(total_kg) from public.waste_transactions where school_id=target_school_id and created_at>=day_start and created_at<day_end), 0)
    ),
    'library', jsonb_build_object(
      'visits', (select count(*) from public.library_visits where school_id=target_school_id and occurred_at>=day_start and occurred_at<day_end),
      'students', (select count(distinct student_id) from public.library_visits where school_id=target_school_id and occurred_at>=day_start and occurred_at<day_end)
    ),
    'extracurricular', jsonb_build_object(
      'recorded', (select count(*) from public.extracurricular_attendance where school_id=target_school_id and recorded_at>=day_start and recorded_at<day_end),
      'present', (select count(*) from public.extracurricular_attendance where school_id=target_school_id and recorded_at>=day_start and recorded_at<day_end and status='PRESENT')
    )
  ) into payload from public.attendance_logs where school_id=target_school_id and occurred_at_local>=day_start and occurred_at_local<day_end;

  insert into public.dashboard_daily_snapshots(school_id,metric_date,metrics,generated_at,stale_after)
  values(target_school_id,local_date,payload,now(),now()+interval '2 minutes')
  on conflict(school_id,metric_date) do update set metrics=excluded.metrics,generated_at=excluded.generated_at,stale_after=excluded.stale_after
  returning * into snapshot;

  return jsonb_build_object('school_id',snapshot.school_id,'date',snapshot.metric_date,'timezone',tz,'metrics',snapshot.metrics,'generated_at',snapshot.generated_at,'stale_after',snapshot.stale_after,'is_stale',false);
end $$;


delete from public.dashboard_daily_snapshots;
notify pgrst,'reload schema';
commit;
