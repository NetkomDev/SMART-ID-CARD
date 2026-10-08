begin;

create or replace function public.resolve_student_card(p_school uuid,p_qr text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare 
  card_rec public.student_cards;
  s public.students;
  class_name text;
begin
 -- Try to find a card first
 select c.* into card_rec from public.student_cards c join public.students st on c.student_id = st.id where c.school_id=p_school and (c.qr_key=p_qr or upper(c.card_uid)=upper(p_qr)) and(c.expires_at is null or c.expires_at>now()) order by c.created_at desc limit 1;
 
 if found then
   select * into s from public.students where id=card_rec.student_id and school_id=p_school and is_active and deleted_at is null limit 1;
 else
   -- If no card found by QR/UID, try to find a student directly by NISN or student number
   select * into s from public.students where school_id=p_school and (nisn=p_qr or student_number=p_qr) and is_active and deleted_at is null order by created_at desc limit 1;
 end if;

 if not found or s.id is null then return null; end if;

 select cl.name into class_name from public.student_class_history h join public.classes cl on cl.id=h.class_id where h.student_id=s.id and h.is_current order by h.start_date desc limit 1;
 return jsonb_build_object('id',s.id,'full_name',s.full_name,'student_number',s.student_number,'nisn',s.nisn,'class_name',class_name,'photo_url',s.photo_url);
end$$;

commit;
