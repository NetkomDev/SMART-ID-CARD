begin;

create or replace function public.record_portal_library_visit(target_school_id uuid,p_event_id uuid,p_card_uid text,p_occurred_at timestamptz,p_local_sequence bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.student_cards;v public.library_visits;cid uuid;s_name text;c_name text;s_nis text;target_student_id uuid;begin
 if not public.portal_session_active() or not public.has_school_access(target_school_id) or not public.has_school_permission(target_school_id,'library.visit') then raise exception 'Library access denied' using errcode='42501';end if;
 if p_local_sequence<0 or p_occurred_at>now()+interval '10 minutes' then raise exception 'Invalid visit time' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(target_school_id::text||p_event_id::text,0));
 
 select * into v from public.library_visits where school_id=target_school_id and event_id=p_event_id;
 if found then 
   select full_name, student_number into s_name, s_nis from public.students where id=v.student_id;
   select cl.name into c_name from public.student_class_history h join public.classes cl on cl.id=h.class_id where h.student_id=v.student_id and h.is_current limit 1;
   return jsonb_build_object('id',v.id,'student_id',v.student_id,'student_name',s_name,'student_number',s_nis,'class_name',c_name,'duplicate',true);
 end if;
 
 -- First, try to find a student directly by NISN or student_number
 select id, full_name, student_number into target_student_id, s_name, s_nis from public.students where school_id=target_school_id and (nisn=p_card_uid or student_number=p_card_uid) and is_active and deleted_at is null order by created_at desc limit 1;
 
 if not found then
   -- If not found directly, try to find via card
   select c.* into c from public.student_cards c join public.students st on c.student_id = st.id where c.school_id=target_school_id and (c.qr_key=p_card_uid or upper(c.card_uid)=upper(p_card_uid)) and(c.expires_at is null or c.expires_at>greatest(now(),p_occurred_at)) order by c.created_at desc limit 1;
   if not found then raise exception 'Card not found or inactive' using errcode='AG004';end if;
   target_student_id := c.student_id;
   select full_name, student_number into s_name, s_nis from public.students where id=target_student_id and school_id=target_school_id and is_active and deleted_at is null limit 1;
   if not found then raise exception 'Student inactive' using errcode='AG006';end if;
 end if;

 if not public.portal_student_allowed(target_school_id,target_student_id) then raise exception 'Student scope denied' using errcode='42501';end if;
 
 select h.class_id, cl.name into cid, c_name from public.student_class_history h join public.classes cl on cl.id=h.class_id where h.school_id=target_school_id and h.student_id=target_student_id and h.is_current order by h.start_date desc limit 1;
 
 insert into public.library_visits(event_id,school_id,device_id,student_id,class_id,occurred_at,local_sequence,source,metadata) values(p_event_id,target_school_id,null,target_student_id,cid,p_occurred_at,p_local_sequence,'REALTIME',jsonb_build_object('portal_user_id',auth.uid())) returning * into v;
 insert into public.library_events(school_id,event_type,aggregate_id,payload) values(target_school_id,'library.visit.created',v.id,to_jsonb(v));
 
 return jsonb_build_object('id',v.id,'student_id',v.student_id,'student_name',s_name,'student_number',s_nis,'class_name',c_name,'duplicate',false);
end$$;

commit;
