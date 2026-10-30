-- Runs once after historical migrations, before new hardening migrations.
insert into auth.users(id,raw_app_meta_data) values('99000000-0000-4000-8000-000000000001','{"portal_access":true}');
insert into public.users(id,full_name) values('99000000-0000-4000-8000-000000000001','Legacy family');
insert into public.schools(id,code,name) values('99000000-0000-4000-8000-000000000002','UPGRADE_FIXTURE','Legacy school');
insert into public.students(id,school_id,student_number,full_name) values('99000000-0000-4000-8000-000000000003','99000000-0000-4000-8000-000000000002','OLD1','Legacy child');
insert into public.parent_student_links(school_id,parent_user_id,student_id,relationship,device_id) values('99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000003','MOTHER','old-browser-id');
