begin;

alter table public.schools
  add column if not exists waste_start_time time,
  add column if not exists waste_end_time time;

comment on column public.schools.waste_start_time is 'Time when waste PWA starts accepting transactions (local timezone)';
comment on column public.schools.waste_end_time is 'Time when waste PWA stops accepting transactions (local timezone)';

commit;
