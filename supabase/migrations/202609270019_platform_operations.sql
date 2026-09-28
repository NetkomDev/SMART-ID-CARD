begin;
create function public.platform_update_school(p_school uuid,p_name text,p_timezone text,p_status public.school_status) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.schools;begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501';end if;
 if p_timezone not in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura') then raise exception 'Invalid timezone';end if;
 update public.schools set name=p_name,timezone=p_timezone,status=p_status,is_active=(p_status='ACTIVE') where id=p_school and deleted_at is null returning * into s;
 if not found then raise exception 'School not found' using errcode='P0002';end if;return to_jsonb(s);
end$$;
create function public.platform_update_membership(p_id uuid,p_status public.membership_status,p_roles text[]) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.school_users;begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501';end if;
 if p_status is null or p_roles is null or p_status not in ('ACTIVE','SUSPENDED','REVOKED') or cardinality(p_roles)<1 or not p_roles<@array['SCHOOL_ADMIN','TEACHER','EXTRA_TEACHER','LIBRARY_STAFF','WASTE_STAFF','PARENT'] then raise exception 'Invalid role or status';end if;
 select * into m from public.school_users where id=p_id and deleted_at is null for update;if not found then raise exception 'Membership not found' using errcode='P0002';end if;
 perform 1 from public.schools where id=m.school_id for update;
 if exists(select 1 from public.school_user_roles a join public.roles r on r.id=a.role_id where a.school_user_id=m.id and r.code='SCHOOL_ADMIN') and (p_status<>'ACTIVE' or not 'SCHOOL_ADMIN'=any(p_roles)) and not exists(select 1 from public.school_users x join public.school_user_roles a on a.school_user_id=x.id join public.roles r on r.id=a.role_id where x.school_id=m.school_id and x.id<>m.id and x.status='ACTIVE' and x.deleted_at is null and r.code='SCHOOL_ADMIN') then raise exception 'At least one active school administrator is required';end if;
 update public.school_users set status=p_status,joined_at=coalesce(joined_at,now()) where id=m.id;
 delete from public.school_user_roles where school_user_id=m.id;
 insert into public.school_user_roles(school_id,school_user_id,role_id,assigned_by) select m.school_id,m.id,r.id,auth.uid() from public.roles r where r.school_id=m.school_id and r.code=any(p_roles) and r.is_active and r.deleted_at is null;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,before_data,after_data) values(m.school_id,auth.uid(),'MEMBERSHIP_ACCESS_UPDATED','school_users',m.id,jsonb_build_object('status',m.status),jsonb_build_object('status',p_status,'roles',p_roles));
 return jsonb_build_object('id',m.id,'status',p_status,'roles',p_roles);
end$$;
create function public.platform_rotate_device(p_device uuid,p_hash text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501';end if;
 select * into d from public.devices where id=p_device and deleted_at is null for update;if not found then raise exception 'Device not found' using errcode='P0002';end if;
 update public.device_credentials set revoked_at=now() where device_id=d.id and revoked_at is null;
 insert into public.device_credentials(school_id,device_id,secret_hash,label) values(d.school_id,d.id,p_hash,'rotated');
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id) values(d.school_id,auth.uid(),'DEVICE_CREDENTIAL_ROTATED','devices',d.id);
end$$;
create function public.platform_device_status(p_device uuid,p_status public.device_status) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.devices;begin
 if not public.is_platform_admin() then raise exception 'Platform authority required' using errcode='42501';end if;
 update public.devices set status=p_status where id=p_device and deleted_at is null returning * into d;if not found then raise exception 'Device not found' using errcode='P0002';end if;return to_jsonb(d);
end$$;
-- Persist domain audit in the same transaction. Never include device configuration/secrets.
create function public.audit_admin_change() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare sid uuid;before_row jsonb;after_row jsonb;begin
 if tg_table_name='devices' and tg_op='UPDATE' then
 if (to_jsonb(new)-'last_seen_at'-'updated_at')=(to_jsonb(old)-'last_seen_at'-'updated_at') then return new;end if;end if;
 after_row:=to_jsonb(new);before_row:=case when tg_op='UPDATE' then to_jsonb(old) else null end;
 sid:=case when tg_table_name='schools' then new.id else (after_row->>'school_id')::uuid end;
 if tg_table_name='devices' then after_row:=after_row-'config';before_row:=before_row-'config';end if;
 insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,before_data,after_data) values(sid,auth.uid(),tg_op||'_'||upper(tg_table_name),tg_table_name,new.id,before_row,after_row);
 return new;
end$$;
create trigger schools_domain_audit after insert or update on public.schools for each row execute function public.audit_admin_change();
create trigger devices_domain_audit after insert or update on public.devices for each row when (new.id is not null) execute function public.audit_admin_change();
-- Only business changes to cards; QR is an identifier but omit it from generic logs.
revoke all on function public.platform_update_school(uuid,text,text,public.school_status),public.platform_update_membership(uuid,public.membership_status,text[]),public.platform_rotate_device(uuid,text),public.platform_device_status(uuid,public.device_status) from public,anon;
grant execute on function public.platform_update_school(uuid,text,text,public.school_status),public.platform_update_membership(uuid,public.membership_status,text[]),public.platform_rotate_device(uuid,text),public.platform_device_status(uuid,public.device_status) to authenticated;
commit;
