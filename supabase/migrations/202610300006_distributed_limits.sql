begin;
create table public.api_rate_buckets(bucket_key text primary key,total_hits bigint not null,reset_at timestamptz not null);
alter table public.api_rate_buckets enable row level security;
revoke all on public.api_rate_buckets from public,anon,authenticated;
create function public.increment_api_rate(p_key text,p_window_ms int) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.api_rate_buckets;
begin
 if p_key !~ '^[a-f0-9]{64}$' or p_window_ms not between 1000 and 3600000 then raise exception 'Invalid rate bucket' using errcode='22023'; end if;
 insert into public.api_rate_buckets values(p_key,1,clock_timestamp()+p_window_ms*interval '1 millisecond')
 on conflict(bucket_key) do update set total_hits=case when api_rate_buckets.reset_at<=clock_timestamp() then 1 else api_rate_buckets.total_hits+1 end,
 reset_at=case when api_rate_buckets.reset_at<=clock_timestamp() then clock_timestamp()+p_window_ms*interval '1 millisecond' else api_rate_buckets.reset_at end returning * into b;
 return jsonb_build_object('total_hits',b.total_hits,'reset_at',b.reset_at);
end $$;
revoke all on function public.increment_api_rate(text,int) from public,anon,authenticated;
grant execute on function public.increment_api_rate(text,int) to service_role;
commit;
