begin;
-- Private normalized medical images; no public URL and no third-party photo provider.
create table public.parent_permit_attachments(
 id uuid primary key default gen_random_uuid(),school_id uuid not null,student_id uuid not null,
 owner_id uuid not null references public.users(id),jpeg_data text not null,created_at timestamptz not null default now(),
 foreign key(school_id,student_id) references public.students(school_id,id),
 check(length(jpeg_data)<=4000000 and jpeg_data ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$')
);
alter table public.parent_permit_attachments enable row level security;
revoke all on public.parent_permit_attachments from public,anon,authenticated;
grant select on public.parent_permit_attachments to authenticated;
create policy attachment_read on public.parent_permit_attachments for select to authenticated
 using((owner_id=auth.uid() and public.can_access_parent_child(student_id)) or public.has_school_permission(school_id,'attendance.read'));
create function public.store_parent_permit_attachment(p_student_id uuid,p_jpeg text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare sid uuid; result uuid;
begin
 if not public.can_access_parent_child(p_student_id) then raise exception 'Child access denied' using errcode='42501'; end if;
 select school_id into sid from public.students where id=p_student_id;
 insert into public.parent_permit_attachments(school_id,student_id,owner_id,jpeg_data) values(sid,p_student_id,auth.uid(),p_jpeg) returning id into result;
 perform public.family_audit(sid,'parent.permit.attachment',result);
 return result;
end $$;
revoke all on function public.store_parent_permit_attachment(uuid,text) from public,anon;
grant execute on function public.store_parent_permit_attachment(uuid,text) to authenticated;

create or replace function public.submit_student_absence_permit(p_student_id uuid,p_permit_date date,p_reason text,p_notes text,p_attachment_url text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare sid uuid; tz text; v_reason public.permit_reason; attachment text; result uuid; v_count int; r record; last_date date; run int:=0;
begin
 if not public.can_access_parent_child(p_student_id) then raise exception 'Child access denied' using errcode='42501'; end if;
 select s.school_id,sc.timezone into sid,tz from public.students s join public.schools sc on sc.id=s.school_id where s.id=p_student_id;
 if p_permit_date is null or p_permit_date < (now() at time zone tz)::date or p_permit_date > (now() at time zone tz)::date+7
 then raise exception 'Tanggal izin harus hari ini sampai 7 hari ke depan' using errcode='22023'; end if;
 if p_reason is null or p_reason not in ('SAKIT','IZIN','ALASAN_LAIN') or length(coalesce(p_notes,''))>500 then raise exception 'Invalid permit' using errcode='22023'; end if;
 v_reason:=p_reason::public.permit_reason;
 perform pg_advisory_xact_lock(hashtextextended('parent-permit:'||p_student_id::text,0));
 attachment:=nullif(btrim(p_attachment_url),'');
 if attachment is not null and not exists(select 1 from public.parent_permit_attachments a
 where 'attachment:'||a.id::text=attachment and a.student_id=p_student_id and a.school_id=sid and a.owner_id=auth.uid())
 then raise exception 'Lampiran privat tidak valid' using errcode='22023'; end if;
 select attachment_url into attachment from public.student_absence_permits where student_id=p_student_id and school_id=sid and permit_date=p_permit_date;
 attachment:=coalesce(nullif(btrim(p_attachment_url),''),attachment);
 insert into public.student_absence_permits(school_id,student_id,parent_user_id,permit_date,reason,notes,attachment_url,status)
 values(sid,p_student_id,auth.uid(),p_permit_date,v_reason,btrim(coalesce(p_notes,'')),attachment,'APPROVED')
 on conflict(school_id,student_id,permit_date) do update set reason=excluded.reason,notes=excluded.notes,attachment_url=excluded.attachment_url,updated_at=now()
 returning id into result;
 -- Bounded history; every affected future record is within the parent submission horizon.
 for r in select * from public.student_absence_permits where school_id=sid and student_id=p_student_id
 and permit_date between p_permit_date-366 and (now() at time zone tz)::date+7 order by permit_date loop
 if r.reason='SAKIT' then
   if last_date=r.permit_date-1 then run:=run+1; else run:=1; end if;
   if r.permit_date >= p_permit_date and run>=2 and not exists(select 1 from public.parent_permit_attachments a where 'attachment:'||a.id::text=r.attachment_url and a.student_id=p_student_id and a.school_id=sid)
   then raise exception 'Surat dokter privat wajib untuk sakit berturut-turut hari ke-2 atau lebih' using errcode='22023'; end if;
 else run:=0;
 end if;
 update public.student_absence_permits set consecutive_sick_days=greatest(run,1) where id=r.id;
 last_date:=r.permit_date;
 end loop;
 select consecutive_sick_days into v_count from public.student_absence_permits where id=result;
 -- Invalidate instead of requiring dashboard.read on a parent's write path.
 update public.dashboard_daily_snapshots set stale_after=now() where school_id=sid;
 perform public.family_audit(sid,'parent.permit.submitted',result);
 return jsonb_build_object('success',true,'permit_id',result,'student_id',p_student_id,'permit_date',p_permit_date,'reason',p_reason,'consecutive_sick_days',v_count,'has_attachment',attachment is not null);
end $$;
revoke all on function public.submit_student_absence_permit(uuid,date,text,text,text) from public,anon;
grant execute on function public.submit_student_absence_permit(uuid,date,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
