-- Migration: Enhance resolve_student_card to support all card statuses (DRAFT, PRINTED, READY_TO_WRITE, VERIFIED, etc.) and fallback student lookup by NISN/NIS
begin;

create or replace function public.resolve_student_card(p_school uuid, p_qr text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  c public.student_cards;
  s public.students;
  class_name text;
  clean_qr text;
begin
  if not public.portal_session_active() or not public.has_school_access(p_school) or not public.has_school_permission(p_school,'student.read') then
    raise exception 'Student access denied' using errcode='42501';
  end if;

  clean_qr := btrim(p_qr);

  -- 1. Try resolving by card record (qr_key, card_uid, card_serial, card id)
  select * into c from public.student_cards
  where school_id = p_school
    and (qr_key = clean_qr or upper(card_uid) = upper(clean_qr) or card_serial = clean_qr or id::text = clean_qr)
    and status in ('ACTIVE', 'BLOCKED')
    and production_status in ('VERIFIED', 'LEGACY', 'PRINTED', 'READY_TO_WRITE', 'WRITING', 'DRAFT')
    and (expires_at is null or expires_at > now())
  order by (status = 'ACTIVE') desc, created_at desc
  limit 1;

  if found then
    if not public.portal_student_allowed(p_school, c.student_id) then
      raise exception 'Student outside permitted scope' using errcode='42501';
    end if;

    select * into s from public.students
    where id = c.student_id and school_id = p_school and is_active and deleted_at is null;

    if not found then
      raise exception 'Student inactive' using errcode='AG006';
    end if;

    select cl.name into class_name
    from public.student_class_history h
    join public.classes cl on cl.id = h.class_id
    where h.school_id = p_school and h.student_id = s.id and h.is_current;

    return jsonb_build_object(
      'id', s.id,
      'full_name', s.full_name,
      'student_number', s.student_number,
      'nisn', s.nisn,
      'class_name', class_name,
      'card_id', c.id
    );
  end if;

  -- 2. Fallback: Try resolving directly by student NISN, NIS, or ID
  select * into s from public.students
  where school_id = p_school
    and (nisn = clean_qr or student_number = clean_qr or id::text = clean_qr or full_name ilike clean_qr)
    and is_active and deleted_at is null
  limit 1;

  if found then
    if not public.portal_student_allowed(p_school, s.id) then
      raise exception 'Student outside permitted scope' using errcode='42501';
    end if;

    select cl.name into class_name
    from public.student_class_history h
    join public.classes cl on cl.id = h.class_id
    where h.school_id = p_school and h.student_id = s.id and h.is_current;

    return jsonb_build_object(
      'id', s.id,
      'full_name', s.full_name,
      'student_number', s.student_number,
      'nisn', s.nisn,
      'class_name', class_name,
      'card_id', null
    );
  end if;

  raise exception 'Kartu / siswa tidak ditemukan di sekolah ini' using errcode='AG004';
end$$;

notify pgrst, 'reload schema';
commit;
