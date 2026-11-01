-- Optimize portal scanner roster for WASTE_STAFF to query directly from student_class_history
-- by the portal's assigned class_id, include photo_url, and ensure lightning-fast single-page sync.

create or replace function public.portal_scanner_roster(p_school uuid,p_after uuid default null,p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  context jsonb;
  roster jsonb;
  total integer;
  last_id uuid;
  assigned_class_id uuid;
begin
  context := public.get_portal_context();
  if (context->>'school_id')::uuid<>p_school or context->>'role_code' not in ('WASTE_STAFF','TEACHER','LIBRARY_STAFF') then
    raise exception 'Scanner access denied' using errcode='42501';
  end if;
  if p_limit not between 1 and 500 then
    raise exception 'Invalid page size' using errcode='22023';
  end if;

  -- 1. Fast path for WASTE_STAFF: query only students of the assigned portal class directly
  if context->>'role_code' = 'WASTE_STAFF' and (context->'metadata'->>'class_id') is not null then
    assigned_class_id := (context->'metadata'->>'class_id')::uuid;
    select coalesce(jsonb_agg(to_jsonb(page) order by page.id),'[]'::jsonb) into roster from (
      select s.id, s.full_name, s.student_number, s.nisn, s.photo_url,
        c.name as class_name,
        coalesce((
          select jsonb_agg(jsonb_build_object('qr_key',sc.qr_key,'card_uid',sc.card_uid,'card_serial',sc.card_serial,'expires_at',sc.expires_at))
          from public.student_cards sc
          where sc.school_id=p_school and sc.student_id=s.id and sc.status='ACTIVE' and (sc.expires_at is null or sc.expires_at>now())
        ),'[]'::jsonb) cards
      from public.student_class_history h
      join public.classes c on c.school_id=h.school_id and c.id=h.class_id
      join public.students s on s.school_id=h.school_id and s.id=h.student_id
      where h.school_id=p_school and h.class_id=assigned_class_id and h.is_current
        and s.is_active and s.deleted_at is null
        and (p_after is null or s.id>p_after)
      order by s.id
      limit p_limit
    ) page;
  else
    -- 2. General path for TEACHER and LIBRARY_STAFF
    select coalesce(jsonb_agg(to_jsonb(page) order by page.id),'[]'::jsonb) into roster from (
      select s.id, s.full_name, s.student_number, s.nisn, s.photo_url,
        (select c.name from public.student_class_history h join public.classes c on c.school_id=h.school_id and c.id=h.class_id where h.school_id=p_school and h.student_id=s.id and h.is_current limit 1) class_name,
        coalesce((
          select jsonb_agg(jsonb_build_object('qr_key',c.qr_key,'card_uid',c.card_uid,'card_serial',c.card_serial,'expires_at',c.expires_at))
          from public.student_cards c
          where c.school_id=p_school and c.student_id=s.id and c.status='ACTIVE' and (c.expires_at is null or c.expires_at>now())
        ),'[]'::jsonb) cards
      from public.students s
      where s.school_id=p_school and s.is_active and s.deleted_at is null and public.portal_student_allowed(p_school,s.id) and (p_after is null or s.id>p_after)
      order by s.id
      limit p_limit
    ) page;
  end if;

  total:=jsonb_array_length(roster);
  if total=p_limit then
    last_id:=(roster->(total-1)->>'id')::uuid;
  end if;
  return jsonb_build_object('school_id',p_school,'students',roster,'next_cursor',last_id);
end $$;

revoke all on function public.portal_scanner_roster(uuid,uuid,integer) from public,anon;
grant execute on function public.portal_scanner_roster(uuid,uuid,integer) to authenticated;
