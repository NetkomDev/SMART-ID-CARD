begin;
create type public.waste_source as enum ('MANUAL','SCALE');
create table public.waste_transactions (
 id uuid primary key default gen_random_uuid(), event_id uuid not null, school_id uuid not null references public.schools(id), class_id uuid not null, student_id uuid not null, staff_user_id uuid not null references public.users(id), organic_kg numeric(10,3) not null, inorganic_kg numeric(10,3) not null, total_kg numeric(10,3) generated always as (organic_kg+inorganic_kg) stored, source public.waste_source not null, created_at timestamptz not null default now(),
 constraint waste_class_fk foreign key(school_id,class_id) references public.classes(school_id,id), constraint waste_student_fk foreign key(school_id,student_id) references public.students(school_id,id), constraint waste_event_key unique(school_id,event_id), constraint waste_weights_nonnegative check(organic_kg>=0 and inorganic_kg>=0 and organic_kg+inorganic_kg>0)
);
create index waste_school_time_idx on public.waste_transactions(school_id,created_at desc);
create index waste_ranking_idx on public.waste_transactions(school_id,class_id,created_at desc);
alter table public.waste_transactions enable row level security; alter table public.waste_transactions force row level security;
create policy waste_read on public.waste_transactions for select to authenticated using(public.has_school_permission(school_id,'waste.read'));
create policy waste_create on public.waste_transactions for insert to authenticated with check(public.has_school_permission(school_id,'waste.create') and staff_user_id=auth.uid());
grant select,insert on public.waste_transactions to authenticated;
commit;
