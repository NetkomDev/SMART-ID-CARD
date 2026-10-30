begin;
create function public.report_period(p_school uuid,p_from timestamptz,p_to timestamptz)
returns table(start_at timestamptz,end_at timestamptz,tz text)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public.portal_session_active() or not public.has_school_permission(p_school,'report.read') then raise exception 'Report access denied' using errcode='42501'; end if;
 select timezone into tz from public.schools where id=p_school;
 select coalesce(p_from,ay.start_date::timestamp at time zone tz),coalesce(p_to,(ay.end_date+1)::timestamp at time zone tz)
 into start_at,end_at from public.academic_years ay where ay.school_id=p_school and ay.is_active and ay.deleted_at is null limit 1;
 start_at:=coalesce(p_from,start_at); end_at:=coalesce(p_to,end_at);
 if start_at is null or end_at is null or end_at<=start_at then raise exception 'Periode/tahun ajaran aktif diperlukan' using errcode='22023'; end if;
 return next;
end $$;
create function public.report_classes(p_school uuid,p_from timestamptz default null,p_to timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p record; rows jsonb;
begin
 select * into p from public.report_period(p_school,p_from,p_to);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,
 'student_count',(select count(*) from public.student_class_history h join public.students s on s.school_id=h.school_id and s.id=h.student_id where h.school_id=p_school and h.class_id=c.id and h.is_current and s.is_active and s.deleted_at is null),
 'attendance_count',(select count(*) from public.attendance_logs a where a.school_id=p_school and a.class_id=c.id and a.direction='CHECK_IN' and a.occurred_at_local>=p.start_at and a.occurred_at_local<p.end_at),
 'attendance_days',(select count(distinct (a.student_id,(a.occurred_at_local at time zone p.tz)::date)) from public.attendance_logs a where a.school_id=p_school and a.class_id=c.id and a.direction='CHECK_IN' and a.occurred_at_local>=p.start_at and a.occurred_at_local<p.end_at),
 'waste_kg',(select coalesce(sum(w.total_kg),0) from public.waste_transactions w where w.school_id=p_school and w.class_id=c.id and w.created_at>=p.start_at and w.created_at<p.end_at),
 'library_visits',(select count(*) from public.library_visits l where l.school_id=p_school and l.class_id=c.id and l.occurred_at>=p.start_at and l.occurred_at<p.end_at),
 'extracurricular_members',(select count(*) from public.extracurricular_members m join public.student_class_history h on h.student_id=m.student_id and h.school_id=m.school_id and h.is_current where m.school_id=p_school and h.class_id=c.id and m.status='ACTIVE')
 ) order by c.name),'[]') into rows from public.classes c where c.school_id=p_school and c.deleted_at is null;
 return jsonb_build_object('rows',rows,'from',p.start_at,'to',p.end_at,'timezone',p.tz,'as_of',now());
end $$;
create function public.report_class_students(p_school uuid,p_class uuid,p_from timestamptz default null,p_to timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p record; rows jsonb;
begin
 select * into p from public.report_period(p_school,p_from,p_to);
 if not exists(select 1 from public.classes where school_id=p_school and id=p_class and deleted_at is null) then raise exception 'Class not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,'student_number',s.student_number,'nisn',s.nisn,
 'attendance_count',(select count(*) from public.attendance_logs a where a.school_id=p_school and a.student_id=s.id and a.direction='CHECK_IN' and a.occurred_at_local>=p.start_at and a.occurred_at_local<p.end_at),
 'attendance_days',(select count(distinct (a.occurred_at_local at time zone p.tz)::date) from public.attendance_logs a where a.school_id=p_school and a.student_id=s.id and a.direction='CHECK_IN' and a.occurred_at_local>=p.start_at and a.occurred_at_local<p.end_at),
 'waste_kg',(select coalesce(sum(w.total_kg),0) from public.waste_transactions w where w.school_id=p_school and w.student_id=s.id and w.created_at>=p.start_at and w.created_at<p.end_at),
 'library_visits',(select count(*) from public.library_visits l where l.school_id=p_school and l.student_id=s.id and l.occurred_at>=p.start_at and l.occurred_at<p.end_at),
 'extracurriculars','[]'::jsonb,'extracurricular_details',coalesce((select jsonb_agg(jsonb_build_object('id',m.extracurricular_id,'name',e.name,
 'total',(select count(*) from public.extracurricular_sessions es where es.school_id=p_school and es.extracurricular_id=m.extracurricular_id and es.status<>'CANCELLED' and es.ends_at<=now() and es.starts_at>=greatest(p.start_at,m.enrolled_at) and es.starts_at<p.end_at),
 'attended',(select count(*) from public.extracurricular_attendance a join public.extracurricular_sessions es on es.school_id=a.school_id and es.id=a.session_id where a.school_id=p_school and a.student_id=s.id and a.extracurricular_id=m.extracurricular_id and a.status='PRESENT' and es.status<>'CANCELLED' and es.ends_at<=now() and es.starts_at>=greatest(p.start_at,m.enrolled_at) and es.starts_at<p.end_at))) from public.extracurricular_members m join public.extracurriculars e on e.school_id=m.school_id and e.id=m.extracurricular_id where m.school_id=p_school and m.student_id=s.id and m.status='ACTIVE'),'[]'::jsonb)) order by s.full_name),'[]') into rows
 from public.students s join public.student_class_history h on h.school_id=s.school_id and h.student_id=s.id and h.is_current where s.school_id=p_school and h.class_id=p_class and s.is_active and s.deleted_at is null;
 return jsonb_build_object('rows',rows,'from',p.start_at,'to',p.end_at,'timezone',p.tz,'as_of',now());
end $$;
create function public.report_library_summary(p_school uuid,p_from timestamptz default null,p_to timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if not public.portal_session_active() or not public.has_school_permission(p_school,'library.read') then raise exception 'Library access denied' using errcode='42501'; end if;
 if p_from is not null and p_to is not null and p_to<=p_from then raise exception 'Invalid period' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (
 select l.class_id,coalesce(c.name,'Tanpa kelas') class_name,count(*) total from public.library_visits l left join public.classes c on c.school_id=l.school_id and c.id=l.class_id
 where l.school_id=p_school and (p_from is null or l.occurred_at>=p_from) and (p_to is null or l.occurred_at<p_to) group by l.class_id,c.name order by count(*) desc) r;
 return result;
end $$;

create table public.report_exports(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),actor_id uuid not null references public.users(id),domain text not null,filters jsonb not null,rows jsonb not null,checksum text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '1 hour');
alter table public.report_exports enable row level security;
revoke all on public.report_exports from public,anon,authenticated;
create function public.create_report_export(p_school uuid,p_domain text,p_from timestamptz default null,p_to timestamptz default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare t text; time_col text; rows jsonb; exp public.report_exports; permission text;
begin
 permission:=p_domain||'.read';
 if not public.portal_session_active() or not public.has_school_permission(p_school,'report.read') or p_domain not in ('attendance','waste','library','extracurricular') or not public.has_school_permission(p_school,permission) then raise exception 'Export access denied' using errcode='42501'; end if;
 if p_from is not null and p_to is not null and p_to<=p_from then raise exception 'Invalid period' using errcode='22023'; end if;
 select case p_domain when 'attendance' then 'attendance_logs' when 'waste' then 'waste_transactions' when 'library' then 'library_visits' else 'extracurricular_attendance' end,
 case p_domain when 'attendance' then 'occurred_at_local' when 'library' then 'occurred_at' when 'extracurricular' then 'recorded_at' else 'created_at' end into t,time_col;
 -- Project safe domain columns; no photo, medical payload, device secret or metadata.
 execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select id,student_id,%I as occurred_at%s from public.%I where school_id=$1 and ($2 is null or %I >= $2) and ($3 is null or %I < $3) order by %I,id limit 100001) r',time_col,case p_domain when 'waste' then ',total_kg,organic_kg,inorganic_kg' when 'attendance' then ',class_id,direction,is_late' when 'library' then ',class_id' else ',session_id,extracurricular_id,status' end,t,time_col,time_col,time_col) into rows using p_school,p_from,p_to;
 if jsonb_array_length(rows)>100000 or octet_length(rows::text)>50000000 then raise exception 'Export too large; choose a smaller period' using errcode='22023'; end if;
 insert into public.report_exports(school_id,actor_id,domain,filters,rows,checksum) values(p_school,auth.uid(),p_domain,jsonb_build_object('from',p_from,'to',p_to),rows,encode(digest(rows::text,'sha256'),'hex')) returning * into exp;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id) values(p_school,auth.uid(),'report.export.created','report_export',exp.id);
 return jsonb_build_object('id',exp.id,'row_count',jsonb_array_length(rows),'checksum',exp.checksum,'as_of',exp.created_at,'expires_at',exp.expires_at,'status','READY','filters',exp.filters);
end $$;
create function public.read_report_export(p_id uuid,p_offset int default 0,p_limit int default 500) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare exp public.report_exports; data jsonb;
begin
 select * into exp from public.report_exports where id=p_id and actor_id=auth.uid() and expires_at>now();
 if not found or not public.portal_session_active() or not public.has_school_permission(exp.school_id,'report.read') or not public.has_school_permission(exp.school_id,exp.domain||'.read') then raise exception 'Export not found or access revoked' using errcode='42501'; end if;
 if p_offset<0 or p_limit not between 1 and 500 then raise exception 'Invalid page' using errcode='22023'; end if;
 select coalesce(jsonb_agg(value order by ord),'[]') into data from jsonb_array_elements(exp.rows) with ordinality r(value,ord) where ord>p_offset and ord<=p_offset+p_limit;
 return jsonb_build_object('id',exp.id,'rows',data,'row_count',jsonb_array_length(exp.rows),'checksum',exp.checksum,'as_of',exp.created_at,'next_offset',case when p_offset+jsonb_array_length(data)<jsonb_array_length(exp.rows) then p_offset+jsonb_array_length(data) else null end);
end $$;
revoke all on function public.report_period(uuid,timestamptz,timestamptz),public.report_classes(uuid,timestamptz,timestamptz),public.report_class_students(uuid,uuid,timestamptz,timestamptz),public.report_library_summary(uuid,timestamptz,timestamptz),public.create_report_export(uuid,text,timestamptz,timestamptz),public.read_report_export(uuid,int,int) from public,anon;
grant execute on function public.report_period(uuid,timestamptz,timestamptz),public.report_classes(uuid,timestamptz,timestamptz),public.report_class_students(uuid,uuid,timestamptz,timestamptz),public.report_library_summary(uuid,timestamptz,timestamptz),public.create_report_export(uuid,text,timestamptz,timestamptz),public.read_report_export(uuid,int,int) to authenticated;
commit;
