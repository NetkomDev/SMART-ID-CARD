begin;

create or replace function public.bind_attendance_scanner(
  p_device_id uuid,
  p_scanner_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_school_id uuid;
  v_context jsonb;
begin
  v_context := public.get_portal_context();
  if v_context is null then
    raise exception 'Sesi portal tidak valid' using errcode = '42501';
  end if;
  v_school_id := (v_context->>'school_id')::uuid;

  if p_scanner_name is null or length(trim(p_scanner_name)) = 0 then
    raise exception 'Nama scanner tidak boleh kosong' using errcode = '22023';
  end if;

  -- Upsert device record
  insert into public.devices (
    id,
    school_id,
    device_code,
    device_type,
    name,
    status,
    last_seen_at,
    config
  ) values (
    p_device_id,
    v_school_id,
    'pwa-' || substring(p_device_id::text from 1 for 8),
    'GATE',
    trim(p_scanner_name),
    'ACTIVE',
    now(),
    jsonb_build_object('is_mobile_pwa', true, 'scanner_name', trim(p_scanner_name), 'bound_at', now())
  )
  on conflict (id) do update set
    name = excluded.name,
    status = 'ACTIVE',
    last_seen_at = now(),
    config = coalesce(public.devices.config, '{}'::jsonb) || jsonb_build_object('scanner_name', excluded.name, 'updated_at', now());

  -- Update last_used_at on the qr token
  update public.qr_access_tokens
  set last_used_at = now()
  where id = (v_context->>'id')::uuid;

  return jsonb_build_object(
    'bound', true,
    'device_id', p_device_id,
    'scanner_name', trim(p_scanner_name)
  );
end $$;

revoke all on function public.bind_attendance_scanner(uuid, text) from public, anon;
grant execute on function public.bind_attendance_scanner(uuid, text) to authenticated;

commit;
