begin;

create or replace function public.resolve_student_card(p_school uuid,p_qr text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c public.student_cards;s public.students;class_name text;begin
 if not public.portal_session_active() or not public.has_school_access(p_school) or not public.has_school_permission(p_school,'student.read') then raise exception 'Student access denied' using errcode='42501';end if;
 select c.* into c from public.student_cards c join public.students st on c.student_id = st.id where c.school_id=p_school and (c.qr_key=p_qr or upper(c.card_uid)=upper(p_qr) or st.nisn=p_qr or st.student_number=p_qr) and c.status='ACTIVE' and c.production_status in ('VERIFIED','LEGACY') and (c.expires_at is null or c.expires_at>now()) limit 1;
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
 select c.* into c from public.student_cards c join public.students st on c.student_id = st.id where c.school_id=target_school_id and (c.qr_key=p_card_uid or upper(c.card_uid)=upper(p_card_uid) or st.nisn=p_card_uid or st.student_number=p_card_uid) and c.status='ACTIVE' and c.production_status in ('VERIFIED','LEGACY') and(c.expires_at is null or c.expires_at>greatest(now(),p_occurred_at)) limit 1;
 if not found then raise exception 'Card not found or inactive' using errcode='AG004';end if;
 if not public.portal_student_allowed(target_school_id,c.student_id) then raise exception 'Student scope denied' using errcode='42501';end if;
 select full_name into student_name from public.students where id=c.student_id and school_id=target_school_id and is_active and deleted_at is null;if not found then raise exception 'Student inactive' using errcode='AG006';end if;
 select class_id into cid from public.student_class_history where school_id=target_school_id and student_id=c.student_id and is_current;
 insert into public.library_visits(event_id,school_id,device_id,student_id,class_id,occurred_at,local_sequence,source,metadata) values(p_event_id,target_school_id,null,c.student_id,cid,p_occurred_at,p_local_sequence,'REALTIME',jsonb_build_object('portal_user_id',auth.uid())) returning * into v;
 insert into public.library_events(school_id,event_type,aggregate_id,payload) values(target_school_id,'library.visit.created',v.id,to_jsonb(v));
 return jsonb_build_object('id',v.id,'student_id',v.student_id,'student_name',student_name,'duplicate',false);
end$$;

commit;
