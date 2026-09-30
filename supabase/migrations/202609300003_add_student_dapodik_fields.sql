begin;
-- Add Dapodik metadata columns to students table
alter table public.students add column if not exists pob text;
alter table public.students add column if not exists address text;

-- Add photo_url to get_parent_children RPC
drop function if exists public.get_parent_children();
create function public.get_parent_children()
 returns table(link_id uuid, student_id uuid, school_id uuid, school_name character varying, full_name character varying, student_number character varying, class_name character varying, relationship parent_relationship, photo_url text)
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select l.id, s.id, l.school_id, sc.name, s.full_name, s.student_number, c.name, l.relationship, s.photo_url
  from public.parent_student_links l
  join public.students s on s.school_id = l.school_id and s.id = l.student_id
  join public.schools sc on sc.id = l.school_id
  left join public.student_class_history h on h.school_id = s.school_id and h.student_id = s.id and h.is_current
  left join public.classes c on c.school_id = h.school_id and c.id = h.class_id
  where public.portal_session_active() 
    and l.parent_user_id = auth.uid() 
    and l.portal_session_id = (auth.jwt()->>'session_id')::uuid 
    and l.status = 'ACTIVE'
    and s.is_active and s.deleted_at is null;
$function$;

-- Add photo update function for parent portal
create or replace function public.update_student_photo_by_parent(p_student_id uuid, p_photo_data text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_student public.students;
  v_parent_user_id uuid := auth.uid();
begin
  if v_parent_user_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select s.* into v_student
  from public.students s
  join public.parent_student_links psl on psl.student_id = s.id
  where s.id = p_student_id and psl.parent_user_id = v_parent_user_id and s.is_active and s.deleted_at is null;

  if not found then
    raise exception 'Student not linked to parent account' using errcode='42501';
  end if;

  update public.students
  set photo_url = p_photo_data,
      updated_at = now()
  where id = p_student_id;

  return jsonb_build_object('success', true, 'student_id', p_student_id);
end$$;

grant execute on function public.get_parent_children() to authenticated;
grant execute on function public.update_student_photo_by_parent(uuid, text) to authenticated;

commit;
