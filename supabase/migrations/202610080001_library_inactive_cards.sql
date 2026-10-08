begin;

create or replace function public.resolve_student_card(p_school uuid,p_qr text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c public.student_cards;s public.students;class_name text;begin
 if not public.portal_session_active() or not public.has_school_access(p_school) or not public.has_school_permission(p_school,'student.read') then raise exception 'Student access denied' using errcode='42501';end if;
 select c.* into c from public.student_cards c join public.students st on c.student_id = st.id where c.school_id=p_school and (c.qr_key=p_qr or upper(c.card_uid)=upper(p_qr) or st.nisn=p_qr or st.student_number=p_qr) and (c.expires_at is null or c.expires_at>now()) order by c.created_at desc limit 1;
 if not found then raise exception 'Card not found or inactive' using errcode='AG004';end if;
 if not public.portal_student_allowed(p_school,c.student_id) then raise exception 'Student outside permitted scope' using errcode='42501';end if;
 select * into s from public.students where id=c.student_id and school_id=p_school and is_active and deleted_at is null;if not found then raise exception 'Student inactive' using errcode='AG006';end if;
 select cl.name into class_name from public.student_class_history h join public.classes cl on cl.id=h.class_id where h.school_id=p_school and h.student_id=s.id and h.is_current;
 return jsonb_build_object('id',s.id,'full_name',s.full_name,'student_number',s.student_number,'class_name',class_name,'card_id',c.id);
end$$;

create or replace function public.record_portal_library_visit(target_school_id uuid,p_event_id uuid,p_card_uid text,p_occurred_at timestamptz,p_local_sequence bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.student_cards;v public.library_visits;cid uuid;student_name text;begin
 if not public.portal_session_active() or not public.has_school_access(target_school_id) or not public.has_school_permission(target_school_id,'library.visit') then raise exception 'Library access denied' using errcode='42501';end if;
 if p_local_sequence<0 or p_occurred_at>now()+interval '10 minutes' then raise exception 'Invalid visit time' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_school_id::text||p_event_id::text,0));
 select * into v from public.library_visits where school_id=target_school_id and event_id=p_event_id;
 if found then return jsonb_build_object('id',v.id,'student_id',v.student_id,'duplicate',true);end if;
 select c.* into c from public.student_cards c join public.students st on c.student_id = st.id where c.school_id=target_school_id and (c.qr_key=p_card_uid or upper(c.card_uid)=upper(p_card_uid) or st.nisn=p_card_uid or st.student_number=p_card_uid) and(c.expires_at is null or c.expires_at>greatest(now(),p_occurred_at)) order by c.created_at desc limit 1;
 if not found then raise exception 'Card not found or inactive' using errcode='AG004';end if;
 if not public.portal_student_allowed(target_school_id,c.student_id) then raise exception 'Student scope denied' using errcode='42501';end if;
 select full_name into student_name from public.students where id=c.student_id and school_id=target_school_id and is_active and deleted_at is null;if not found then raise exception 'Student inactive' using errcode='AG006';end if;
 select class_id into cid from public.student_class_history where school_id=target_school_id and student_id=c.student_id and is_current;
 insert into public.library_visits(event_id,school_id,device_id,student_id,class_id,occurred_at,local_sequence,source,metadata) values(p_event_id,target_school_id,null,c.student_id,cid,p_occurred_at,p_local_sequence,'REALTIME',jsonb_build_object('portal_user_id',auth.uid())) returning * into v;
 insert into public.library_events(school_id,event_type,aggregate_id,payload) values(target_school_id,'library.visit.created',v.id,to_jsonb(v));
 return jsonb_build_object('id',v.id,'student_id',v.student_id,'student_name',student_name,'duplicate',false);
end$$;

create or replace function public.ingest_library_visit(
  target_device_id uuid, device_secret text, visit_event_id uuid, visit_card_uid text,
  visit_occurred_at timestamptz, visit_local_sequence bigint,
  visit_source public.library_visit_source default 'REALTIME', visit_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare device_row public.devices; card_row public.student_cards; visit_row public.library_visits; class_row_id uuid;
begin
  if visit_local_sequence < 0 or visit_occurred_at > now() + interval '10 minutes' then
    raise exception 'invalid event clock or sequence' using errcode = 'AG007';
  end if;
  select d.* into device_row from public.devices d join public.device_credentials dc
    on dc.device_id=d.id and dc.school_id=d.school_id
    where d.id=target_device_id and d.device_type='LIBRARY' and d.status='ACTIVE' and d.deleted_at is null
      and dc.secret_hash=encode(digest(device_secret,'sha256'),'hex') and dc.revoked_at is null
      and (dc.expires_at is null or dc.expires_at>now()) limit 1;
  if not found then raise exception 'invalid library device credential' using errcode='28000'; end if;
  if not exists(select 1 from public.schools where id=device_row.school_id and status='ACTIVE' and is_active and deleted_at is null) then raise exception 'School inactive' using errcode='28000';end if;
  perform pg_advisory_xact_lock(hashtextextended(device_row.school_id::text||visit_event_id::text,0));
  select * into visit_row from public.library_visits where school_id=device_row.school_id and event_id=visit_event_id;
  if found then return jsonb_build_object('id',visit_row.id,'event_id',visit_row.event_id,'student_id',visit_row.student_id,'duplicate',true); end if;
  select c.* into card_row from public.student_cards c join public.students st on c.student_id=st.id where c.school_id=device_row.school_id and (upper(c.card_uid)=upper(visit_card_uid) or c.qr_key=visit_card_uid or st.nisn=visit_card_uid or st.student_number=visit_card_uid) and (c.expires_at is null or c.expires_at>visit_occurred_at) order by c.created_at desc limit 1;
  if not found then raise exception 'card not found or inactive' using errcode='AG004'; end if;
  if not exists(select 1 from public.students where id=card_row.student_id and school_id=device_row.school_id and is_active and deleted_at is null) then raise exception 'Student inactive' using errcode='AG006';end if;
  select class_id into class_row_id from public.student_class_history where school_id=device_row.school_id
    and student_id=card_row.student_id and is_current order by start_date desc limit 1;
  insert into public.library_visits(event_id,school_id,device_id,student_id,class_id,occurred_at,local_sequence,source,metadata)
    values(visit_event_id,device_row.school_id,device_row.id,card_row.student_id,class_row_id,visit_occurred_at,visit_local_sequence,visit_source,visit_metadata)
    returning * into visit_row;
  insert into public.library_events(school_id,event_type,aggregate_id,payload)
    values(device_row.school_id,'library.visit.created',visit_row.id,to_jsonb(visit_row));
  update public.device_credentials set last_used_at=now() where device_id=device_row.id
    and secret_hash=encode(digest(device_secret,'sha256'),'hex');
  return jsonb_build_object('id',visit_row.id,'event_id',visit_row.event_id,'student_id',visit_row.student_id,'class_id',visit_row.class_id,'duplicate',false);
end $$;

commit;
