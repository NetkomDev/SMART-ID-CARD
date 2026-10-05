begin;

-- 1. Fix level column for all existing schools in public.schools
update public.schools
set level = 'SD'
where (name ilike '%SD%' or name ilike '%sekolah dasar%' or code ilike '%SD%')
  and level <> 'SD';

update public.schools
set level = 'SMP'
where (name ilike '%SMP%' or name ilike '%sekolah menengah pertama%' or code ilike '%SMP%')
  and level <> 'SMP';

update public.schools
set level = 'SMA'
where (name ilike '%SMA%' or name ilike '%SMK%' or name ilike '%sekolah menengah atas%' or code ilike '%SMA%' or code ilike '%SMK%')
  and level <> 'SMA';

-- 2. Fix print_snapshot school_level for existing student_cards
update public.student_cards
set print_snapshot = jsonb_set(print_snapshot, '{school_level}', '"SD"')
where print_snapshot->>'school_name' ilike '%SD%'
   or print_snapshot->>'school_name' ilike '%sekolah dasar%';

update public.student_cards
set print_snapshot = jsonb_set(print_snapshot, '{school_level}', '"SMP"')
where print_snapshot->>'school_name' ilike '%SMP%'
   or print_snapshot->>'school_name' ilike '%sekolah menengah pertama%';

-- 3. Update create_card_batch RPC to accurately derive school_level
create or replace function public.create_card_batch(
  p_id uuid,
  p_school uuid,
  p_students uuid[],
  p_class uuid default null,
  p_replaces uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare 
  s public.students;
  c public.classes;
  school public.schools;
  old_card public.student_cards;
  cid uuid;
  existing public.card_batches;
  derived_level text;
begin
  if not public.is_platform_admin() then 
    raise exception 'Platform authority required' using errcode='42501';
  end if;

  if p_students is null or cardinality(p_students) not between 1 and 200 or cardinality(p_students)<>(select count(distinct x) from unnest(p_students) x) then 
    raise exception 'Select 1 to 200 distinct students';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production:'||p_school::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));

  select * into existing from public.card_batches where id=p_id;
  if found then
    if existing.school_id<>p_school or existing.created_by<>auth.uid() or existing.class_id is distinct from p_class or (select array_agg(student_id order by student_id) from public.student_cards where batch_id=p_id) is distinct from (select array_agg(x order by x) from unnest(p_students)x) or exists(select 1 from public.student_cards where batch_id=p_id and replaces_card_id is distinct from p_replaces) then 
      raise exception 'Batch idempotency conflict';
    end if;
    return p_id;
  end if;

  select * into school from public.schools where id=p_school and is_active and status='ACTIVE' and deleted_at is null for update;
  if not found then 
    raise exception 'School is inactive';
  end if;

  -- Auto-detect derived_level from school name/code if level is not explicitly set or defaults to SMA
  derived_level := school.level;
  if school.name ilike '%SD%' or school.name ilike '%sekolah dasar%' or school.code ilike '%SD%' then
    derived_level := 'SD';
  elsif school.name ilike '%SMP%' or school.name ilike '%sekolah menengah pertama%' or school.code ilike '%SMP%' then
    derived_level := 'SMP';
  elsif school.name ilike '%SMA%' or school.name ilike '%SMK%' or school.code ilike '%SMA%' or school.code ilike '%SMK%' then
    derived_level := 'SMA';
  elsif derived_level is null then
    derived_level := 'SMA';
  end if;

  if p_class is not null then 
    select * into c from public.classes where id=p_class and school_id=p_school and is_active and deleted_at is null;
    if not found then 
      raise exception 'Invalid class';
    end if;
  end if;

  if p_replaces is not null then
    select * into old_card from public.student_cards where school_id=p_school and id=p_replaces for update;
    if not found or cardinality(p_students)<>1 or old_card.student_id<>p_students[1] or old_card.production_status not in ('VERIFIED','LEGACY') or old_card.status not in ('LOST','BLOCKED','EXPIRED') then 
      raise exception 'Block or mark the previous card lost before replacing it';
    end if;
  end if;

  insert into public.card_batches(id,school_id,class_id,academic_year_id,created_by) 
  values(p_id,p_school,p_class,c.academic_year_id,auth.uid());

  for s in select * from public.students where school_id=p_school and id=any(p_students) and is_active and deleted_at is null order by id for update loop
    if p_class is not null and not exists(select 1 from public.student_class_history where school_id=p_school and student_id=s.id and class_id=p_class and is_current) then 
      raise exception 'Student is not in selected class';
    end if;

    if s.photo_url is null or btrim(s.photo_url) = '' then
      raise exception 'Siswa % belum memiliki foto resmi yang diunggah dari PWA Orang Tua', s.full_name;
    end if;

    if exists(select 1 from public.student_cards where school_id=p_school and student_id=s.id and (status='ACTIVE' or production_status in ('DRAFT','PRINTED','READY_TO_WRITE','WRITING','FAILED'))) then 
      raise exception 'Student already has an active card or unfinished production';
    end if;

    cid:=gen_random_uuid();
    insert into public.student_cards(id,school_id,student_id,card_serial,qr_key,status,revoked_at,production_status,batch_id,replaces_card_id,print_snapshot)
    values(
      cid,p_school,s.id,'AKS-'||upper(replace(cid::text,'-','')),encode(gen_random_bytes(24),'hex'),'BLOCKED',now(),'DRAFT',p_id,p_replaces,
      jsonb_build_object(
        'student_name',s.full_name,
        'student_number',s.student_number,
        'school_name',school.name,
        'school_code',school.code,
        'school_logo_url',school.logo_url,
        'school_level',derived_level,
        'principal_name',school.principal_name,
        'principal_signature_url',school.principal_signature_url,
        'photo_url',s.photo_url,
        'nisn',s.nisn,
        'gender',s.gender,
        'date_of_birth',s.date_of_birth,
        'address',s.address,
        'class_name',coalesce(c.name,(select cl.name from public.student_class_history h join public.classes cl on cl.id=h.class_id where h.school_id=p_school and h.student_id=s.id and h.is_current limit 1)),
        'template_version','aksis-v1'
      )
    );
  end loop;

  if (select count(*) from public.student_cards where batch_id=p_id)<>cardinality(p_students) then 
    raise exception 'Some students are inactive or belong to another school';
  end if;

  insert into public.audit_logs(school_id,actor_user_id,action,resource_type,resource_id,after_data) values(p_school,auth.uid(),'CARD_BATCH_CREATED','card_batches',p_id,jsonb_build_object('count',cardinality(p_students),'class_id',p_class));
  return p_id;
end$$;

commit;
