begin;

create table public.dashboard_daily_snapshots (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  metric_date date not null, metrics jsonb not null, generated_at timestamptz not null default now(),
  stale_after timestamptz not null, unique(school_id,metric_date), unique(school_id,id),
  check(jsonb_typeof(metrics)='object'), check(stale_after>generated_at)
);
create index dashboard_snapshot_freshness_idx on public.dashboard_daily_snapshots(school_id,generated_at desc);
alter table public.dashboard_daily_snapshots enable row level security;
alter table public.dashboard_daily_snapshots force row level security;
create policy dashboard_snapshot_read on public.dashboard_daily_snapshots for select to authenticated
using(public.has_school_permission(school_id,'dashboard.read'));
grant select on public.dashboard_daily_snapshots to authenticated;

create function public.refresh_dashboard_today(target_school_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare tz text; local_date date; day_start timestamptz; day_end timestamptz; payload jsonb; snapshot public.dashboard_daily_snapshots;
begin
  if not public.has_school_permission(target_school_id,'dashboard.read') then raise exception 'dashboard access denied' using errcode='42501'; end if;
  select timezone into tz from public.schools where id=target_school_id and status='ACTIVE' and is_active and deleted_at is null;
  if not found then raise exception 'school not found' using errcode='P0002'; end if;
  local_date := (now() at time zone tz)::date; day_start := local_date::timestamp at time zone tz; day_end := (local_date+1)::timestamp at time zone tz;
  select jsonb_build_object(
    'attendance',jsonb_build_object('total',count(*),'late',count(*) filter(where is_late),'students',count(distinct student_id)),
    'waste',jsonb_build_object('transactions',(select count(*) from public.waste_transactions where school_id=target_school_id and created_at>=day_start and created_at<day_end),'total_kg',coalesce((select sum(total_kg) from public.waste_transactions where school_id=target_school_id and created_at>=day_start and created_at<day_end),0)),
    'library',jsonb_build_object('visits',(select count(*) from public.library_visits where school_id=target_school_id and occurred_at>=day_start and occurred_at<day_end),'students',(select count(distinct student_id) from public.library_visits where school_id=target_school_id and occurred_at>=day_start and occurred_at<day_end)),
    'extracurricular',jsonb_build_object('recorded',(select count(*) from public.extracurricular_attendance where school_id=target_school_id and recorded_at>=day_start and recorded_at<day_end),'present',(select count(*) from public.extracurricular_attendance where school_id=target_school_id and recorded_at>=day_start and recorded_at<day_end and status='PRESENT'))
  ) into payload from public.attendance_logs where school_id=target_school_id and occurred_at_local>=day_start and occurred_at_local<day_end;
  insert into public.dashboard_daily_snapshots(school_id,metric_date,metrics,generated_at,stale_after)
  values(target_school_id,local_date,payload,now(),now()+interval '2 minutes')
  on conflict(school_id,metric_date) do update set metrics=excluded.metrics,generated_at=excluded.generated_at,stale_after=excluded.stale_after
  returning * into snapshot;
  return jsonb_build_object('school_id',snapshot.school_id,'date',snapshot.metric_date,'timezone',tz,'metrics',snapshot.metrics,'generated_at',snapshot.generated_at,'stale_after',snapshot.stale_after,'is_stale',false);
end $$;
revoke all on function public.refresh_dashboard_today(uuid) from public;
grant execute on function public.refresh_dashboard_today(uuid) to authenticated;
create function public.get_dashboard_today(target_school_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare tz text; local_date date; snapshot public.dashboard_daily_snapshots;
begin
  if not public.has_school_permission(target_school_id,'dashboard.read') then raise exception 'dashboard access denied' using errcode='42501'; end if;
  select timezone into tz from public.schools where id=target_school_id and status='ACTIVE' and is_active and deleted_at is null;
  if not found then raise exception 'school not found' using errcode='P0002'; end if;
  local_date := (now() at time zone tz)::date;
  select * into snapshot from public.dashboard_daily_snapshots where school_id=target_school_id and metric_date=local_date;
  if not found or snapshot.stale_after<=now() then return public.refresh_dashboard_today(target_school_id); end if;
  return jsonb_build_object('school_id',snapshot.school_id,'date',snapshot.metric_date,'timezone',tz,'metrics',snapshot.metrics,'generated_at',snapshot.generated_at,'stale_after',snapshot.stale_after,'is_stale',false);
end $$;
revoke all on function public.get_dashboard_today(uuid) from public;
grant execute on function public.get_dashboard_today(uuid) to authenticated;
commit;
