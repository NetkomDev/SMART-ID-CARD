begin;
-- Null means the school has not configured rewards. Never invent points for old deposits.
alter table public.schools
 add column waste_organic_points_per_kg numeric(10,3) check (waste_organic_points_per_kg between 0 and 10000),
 add column waste_inorganic_points_per_kg numeric(10,3) check (waste_inorganic_points_per_kg between 0 and 10000);
alter table public.waste_transactions add column points_earned numeric(14,2);
create index waste_student_time_idx on public.waste_transactions(school_id,student_id,created_at desc);

create function public.prepare_waste_deposit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.schools; local_time time; begin
 select * into strict s from public.schools where id=new.school_id;
 if not exists(select 1 from public.student_class_history h
   join public.students st on st.school_id=h.school_id and st.id=h.student_id
   join public.classes c on c.school_id=h.school_id and c.id=h.class_id
   where h.school_id=new.school_id and h.student_id=new.student_id and h.class_id=new.class_id
     and h.is_current and st.is_active and st.deleted_at is null and c.is_active and c.deleted_at is null) then
   raise exception 'Siswa tidak terdaftar aktif di kelas ini.' using errcode='23514';
 end if;
 local_time := (now() at time zone s.timezone)::time;
 if (s.waste_start_time is not null and s.waste_end_time is not null and s.waste_start_time>s.waste_end_time
      and local_time<s.waste_start_time and local_time>s.waste_end_time)
   or ((s.waste_start_time is null or s.waste_end_time is null or s.waste_start_time<=s.waste_end_time)
      and ((s.waste_start_time is not null and local_time<s.waste_start_time)
        or (s.waste_end_time is not null and local_time>s.waste_end_time))) then
   raise exception 'Di luar jadwal setoran. Hubungi admin sekolah.' using errcode='42501';
 end if;
 new.created_at := now();
 new.points_earned := case
   when (new.organic_kg=0 or s.waste_organic_points_per_kg is not null)
    and (new.inorganic_kg=0 or s.waste_inorganic_points_per_kg is not null)
   then round(new.organic_kg*coalesce(s.waste_organic_points_per_kg,0)+new.inorganic_kg*coalesce(s.waste_inorganic_points_per_kg,0),2)
   else null end;
 return new;
end $$;
revoke all on function public.prepare_waste_deposit() from public,anon,authenticated;
create trigger prepare_waste_deposit before insert on public.waste_transactions
 for each row execute function public.prepare_waste_deposit();

-- Deliberately school-wide, but only exposes ranking names and aggregate weights.
-- Raw student and transaction RLS remains class-scoped for QR operators.
create function public.waste_dashboard(p_school_id uuid,p_period text default 'month') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.schools; day_start timestamptz; period_start timestamptz; result jsonb; begin
 if auth.uid() is null or not public.portal_session_active()
   or not public.has_school_permission(p_school_id,'waste.read')
   or exists(select 1 from public.qr_access_tokens q where q.auth_user_id=auth.uid()
     and (q.school_id<>p_school_id or q.role_code<>'WASTE_STAFF')) then
   raise exception 'Akses klasemen ditolak.' using errcode='42501';
 end if;
 if p_period is null or p_period not in ('today','month','all') then
   raise exception 'Periode tidak valid.' using errcode='22023';
 end if;
 select * into strict s from public.schools where id=p_school_id and is_active and deleted_at is null;
 day_start := date_trunc('day',now() at time zone s.timezone) at time zone s.timezone;
 period_start := case p_period when 'today' then day_start
   when 'month' then date_trunc('month',now() at time zone s.timezone) at time zone s.timezone
   else '-infinity'::timestamptz end;
 with deposits as materialized (
   select * from public.waste_transactions where school_id=p_school_id and created_at>=period_start and created_at<=now()
 ), class_totals as (
   select c.id class_id,c.name class_name,coalesce(sum(d.total_kg),0) total_kg,count(distinct d.student_id) student_count
   from public.classes c left join deposits d on d.class_id=c.id
   where c.school_id=p_school_id and c.deleted_at is null and c.is_active group by c.id,c.name
 ), student_totals as materialized (
   select st.id student_id,st.full_name,c.name class_name,coalesce(t.total_kg,0) total_kg
   from public.students st
   join public.student_class_history h on h.school_id=st.school_id and h.student_id=st.id and h.is_current
   join public.classes c on c.school_id=h.school_id and c.id=h.class_id and c.is_active and c.deleted_at is null
   left join (select student_id,sum(total_kg) total_kg from deposits group by student_id) t on t.student_id=st.id
   where st.school_id=p_school_id and st.is_active and st.deleted_at is null
 ), today as (
   select count(distinct student_id) students,count(*) transactions,coalesce(sum(total_kg),0) total_kg,
     coalesce(sum(points_earned),0) points,count(*) filter(where points_earned is null) unscored
   from public.waste_transactions where school_id=p_school_id and created_at>=day_start and created_at<=now()
 ) select jsonb_build_object(
   'period',p_period,'timezone',s.timezone,'as_of',now(),
   'rates',jsonb_build_object('organic',s.waste_organic_points_per_kg,'inorganic',s.waste_inorganic_points_per_kg),
   'today',(select to_jsonb(today) from today),
   'classes',coalesce((select jsonb_agg(to_jsonb(c) order by c.total_kg desc,c.class_name,c.class_id) from class_totals c),'[]'::jsonb),
   'top_students',coalesce((select jsonb_agg(to_jsonb(t) order by t.total_kg desc,t.full_name,t.student_id) from
     (select * from student_totals where total_kg>0 order by total_kg desc,full_name,student_id limit 3) t),'[]'::jsonb),
   'bottom_students',coalesce((select jsonb_agg(to_jsonb(t) order by t.total_kg,t.full_name,t.student_id) from
     (select * from student_totals order by total_kg,full_name,student_id limit 3) t),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.waste_dashboard(uuid,text) from public,anon;
grant execute on function public.waste_dashboard(uuid,text) to authenticated;
commit;
