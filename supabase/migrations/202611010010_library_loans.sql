begin;
create table public.library_loans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  event_id uuid not null,
  student_id uuid not null references public.students(id),
  book_title text not null check (length(trim(book_title)) between 1 and 200),
  book_author text not null check (length(trim(book_author)) between 1 and 200),
  borrowed_at timestamptz not null,
  due_date date not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  returned_at timestamptz,
  unique(school_id,event_id)
);
create index library_loans_school_due on public.library_loans(school_id,due_date) where returned_at is null;
alter table public.library_loans enable row level security;
revoke all on public.library_loans from public, anon, authenticated;

create function public.record_portal_library_loan(p_school uuid,p_event_id uuid,p_student_id uuid,p_title text,p_author text,p_borrowed_at timestamptz,p_due_date date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare loan public.library_loans; context jsonb;
begin
  context := public.get_portal_context();
  if (context->>'school_id')::uuid <> p_school or context->>'role_code' <> 'LIBRARY_STAFF' or not public.has_school_permission(p_school,'library.visit') then
    raise exception 'Library access denied' using errcode='42501';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 or p_author is null or length(trim(p_author)) not between 1 and 200 or p_due_date is null or p_borrowed_at is null or p_borrowed_at > now()+interval '10 minutes' or p_due_date < (p_borrowed_at at time zone 'Asia/Makassar')::date then
    raise exception 'Invalid loan data' using errcode='22023';
  end if;
  if not exists(select 1 from public.students where id=p_student_id and school_id=p_school and is_active and deleted_at is null) or not public.portal_student_allowed(p_school,p_student_id) then
    raise exception 'Student unavailable' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_event_id::text,0));
  select * into loan from public.library_loans where school_id=p_school and event_id=p_event_id;
  if found then
    if loan.student_id<>p_student_id or loan.book_title<>trim(p_title) or loan.book_author<>trim(p_author) or loan.due_date<>p_due_date then
      raise exception 'Event conflict' using errcode='23505';
    end if;
    return to_jsonb(loan);
  end if;
  insert into public.library_loans(school_id,event_id,student_id,book_title,book_author,borrowed_at,due_date,created_by)
    values(p_school,p_event_id,p_student_id,trim(p_title),trim(p_author),p_borrowed_at,p_due_date,auth.uid()) returning * into loan;
  return to_jsonb(loan);
end $$;
create function public.list_portal_library_loans(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare context jsonb;
begin
  context := public.get_portal_context();
  if (context->>'school_id')::uuid <> p_school or context->>'role_code' <> 'LIBRARY_STAFF' or not public.has_school_permission(p_school,'library.read') then
    raise exception 'Library access denied' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.borrowed_at desc) from (
    select l.id,l.event_id,l.student_id,s.full_name as student_name,l.book_title,l.book_author,l.borrowed_at,l.due_date,l.returned_at
    from public.library_loans l join public.students s on s.id=l.student_id and s.school_id=l.school_id
    where l.school_id=p_school and l.returned_at is null order by l.borrowed_at desc limit 200
  ) x),'[]'::jsonb);
end $$;
revoke all on function public.record_portal_library_loan(uuid,uuid,uuid,text,text,timestamptz,date),public.list_portal_library_loans(uuid) from public,anon;
grant execute on function public.record_portal_library_loan(uuid,uuid,uuid,text,text,timestamptz,date),public.list_portal_library_loans(uuid) to authenticated;
create function public.portal_scanner_roster(p_school uuid,p_after uuid default null,p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare context jsonb; roster jsonb; total integer; last_id uuid;
begin
  context := public.get_portal_context();
  if (context->>'school_id')::uuid<>p_school or context->>'role_code' not in ('WASTE_STAFF','TEACHER','LIBRARY_STAFF') then raise exception 'Scanner access denied' using errcode='42501'; end if;
  if p_limit not between 1 and 500 then raise exception 'Invalid page size' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id),'[]'::jsonb) into roster from (
    select s.id,s.full_name,s.student_number,s.nisn,
      (select c.name from public.student_class_history h join public.classes c on c.school_id=h.school_id and c.id=h.class_id where h.school_id=p_school and h.student_id=s.id and h.is_current limit 1) class_name,
      coalesce((select jsonb_agg(jsonb_build_object('qr_key',c.qr_key,'card_uid',c.card_uid,'card_serial',c.card_serial,'expires_at',c.expires_at)) from public.student_cards c where c.school_id=p_school and c.student_id=s.id and c.status='ACTIVE' and (c.expires_at is null or c.expires_at>now())),'[]'::jsonb) cards
    from public.students s where s.school_id=p_school and s.is_active and s.deleted_at is null and public.portal_student_allowed(p_school,s.id) and (p_after is null or s.id>p_after) order by s.id limit p_limit
  ) page;
  total:=jsonb_array_length(roster);if total=p_limit then last_id:=(roster->(total-1)->>'id')::uuid;end if;
  return jsonb_build_object('school_id',p_school,'students',roster,'next_cursor',last_id);
end $$;
revoke all on function public.portal_scanner_roster(uuid,uuid,integer) from public,anon;
grant execute on function public.portal_scanner_roster(uuid,uuid,integer) to authenticated;
commit;
