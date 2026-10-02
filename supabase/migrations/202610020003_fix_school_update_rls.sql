begin;

drop policy if exists "schools_update_member" on public.schools;

create policy "schools_update_member" on public.schools
  for update
  to authenticated
  using (has_school_access(id))
  with check (has_school_access(id));

commit;
