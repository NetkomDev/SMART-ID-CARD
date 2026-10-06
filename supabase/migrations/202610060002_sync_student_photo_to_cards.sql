-- Migration: Sync student photo updates to card snapshots
begin;

-- 1. Update update_student_photo_by_parent RPC to also update DRAFT card snapshots
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

  update public.student_cards
  set print_snapshot = jsonb_set(print_snapshot, '{photo_url}', to_jsonb(p_photo_data))
  where student_id = p_student_id
    and (production_status in ('DRAFT', 'PRINTED', 'READY_TO_WRITE', 'WRITING', 'FAILED') or status = 'BLOCKED');

  return jsonb_build_object('success', true, 'student_id', p_student_id);
end$$;

grant execute on function public.update_student_photo_by_parent(uuid, text) to authenticated;

-- 2. Create trigger function to automatically sync photo updates from students to student_cards print_snapshot
create or replace function public.sync_student_photo_to_card_snapshots()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if NEW.photo_url is distinct from OLD.photo_url and NEW.photo_url is not null and btrim(NEW.photo_url) <> '' then
    update public.student_cards
    set print_snapshot = jsonb_set(print_snapshot, '{photo_url}', to_jsonb(NEW.photo_url))
    where student_id = NEW.id
      and (production_status in ('DRAFT', 'PRINTED', 'READY_TO_WRITE', 'WRITING', 'FAILED') or status = 'BLOCKED');
  end if;
  return NEW;
end$$;

drop trigger if exists trg_sync_student_photo on public.students;
create trigger trg_sync_student_photo
  after update of photo_url on public.students
  for each row
  execute function public.sync_student_photo_to_card_snapshots();

-- 3. Backfill all existing student_cards rows where print_snapshot photo_url does not match current students photo_url
update public.student_cards sc
set print_snapshot = jsonb_set(sc.print_snapshot, '{photo_url}', to_jsonb(s.photo_url))
from public.students s
where sc.student_id = s.id
  and s.photo_url is not null
  and btrim(s.photo_url) <> ''
  and sc.print_snapshot->>'photo_url' is distinct from s.photo_url;

notify pgrst, 'reload schema';
commit;
