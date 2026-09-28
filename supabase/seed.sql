-- Seed data for SMA Negeri 3 Watampone

BEGIN;

-- Clean up existing data (Cascade should handle relations)
DELETE FROM public.schools WHERE code = 'SMAN3WTP';

DO $$
DECLARE
  v_school_id UUID := gen_random_uuid();
  v_academic_year_id UUID := gen_random_uuid();
  
  -- Roles
  v_role_super UUID := gen_random_uuid();
  v_role_admin UUID := gen_random_uuid();
  v_role_teacher UUID := gen_random_uuid();
  v_role_library UUID := gen_random_uuid();
  v_role_waste UUID := gen_random_uuid();
  v_role_parent UUID := gen_random_uuid();

  -- Admin Users
  v_admin_user_id UUID := gen_random_uuid();
  v_school_user_id UUID := gen_random_uuid();
  v_super_user_id UUID := gen_random_uuid();
  v_super_school_user_id UUID := gen_random_uuid();

  -- Classes
  v_class_x_a UUID := gen_random_uuid();
  v_class_x_b UUID := gen_random_uuid();
  v_class_xi_a UUID := gen_random_uuid();
  v_class_xi_b UUID := gen_random_uuid();
  v_class_xii_a UUID := gen_random_uuid();
  v_class_xii_b UUID := gen_random_uuid();

  -- Permissions Arrays
  v_perm RECORD;
BEGIN
  -- 1. Insert School
  INSERT INTO public.schools (id, code, name, timezone, is_active)
  VALUES (v_school_id, 'SMAN3WTP', 'SMA Negeri 3 Watampone', 'Asia/Makassar', true);

  -- 2. Insert Roles
  INSERT INTO public.roles (id, school_id, code, name, is_system) VALUES
  (v_role_admin, v_school_id, 'SCHOOL_ADMIN', 'Administrator Sekolah', true),
  (v_role_teacher, v_school_id, 'TEACHER', 'Guru', true),
  (v_role_library, v_school_id, 'LIBRARY_STAFF', 'Staf Perpustakaan', true),
  (v_role_waste, v_school_id, 'WASTE_STAFF', 'Staf Bank Sampah', true),
  (v_role_parent, v_school_id, 'PARENT', 'Orang Tua / Wali', true);

  -- 3. Insert Permissions & Assign to Roles
  FOR v_perm IN SELECT * FROM (VALUES 
    ('student.read', 'Lihat data siswa'), ('student.create', 'Tambah siswa'), ('student.update', 'Ubah siswa'),
    ('card.read', 'Lihat kartu'), ('card.manage', 'Kelola kartu'), ('card.write', 'Tulis kartu NFC'),
    ('device.read', 'Lihat perangkat'), ('device.manage', 'Kelola perangkat'),
    ('attendance.read', 'Lihat kehadiran'), ('academic.manage', 'Kelola akademik'),
    ('iam.manage', 'Kelola akses'), ('library.manage', 'Kelola perpustakaan'),
    ('waste.manage', 'Kelola bank sampah'), ('extracurricular.manage', 'Kelola ekstrakurikuler'),
    ('led.manage', 'Kelola LED'), ('dashboard.read', 'Lihat dashboard'),
    ('audit.read', 'Lihat audit log'), ('report.read', 'Akses laporan')
  ) AS p(code, description)
  LOOP
    DECLARE v_perm_id UUID := gen_random_uuid();
    BEGIN
      INSERT INTO public.permissions (id, school_id, code, description)
      VALUES (v_perm_id, v_school_id, v_perm.code, v_perm.description);

      -- Platform authority is trusted Auth metadata, never a tenant role.
      
      -- School Admin gets most things
      IF v_perm.code NOT IN ('iam.manage', 'audit.read') THEN
        INSERT INTO public.role_permissions (school_id, role_id, permission_id)
        VALUES (v_school_id, v_role_admin, v_perm_id);
      END IF;
    END;
  END LOOP;

  -- 4. Create Admin Users in auth.users & public.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES 
  (
    v_admin_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
    'admin@sman3.sch.id', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''
  ),
  (
    v_super_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
    'superadmin@aksis.co.id', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''
  );

  UPDATE auth.users SET raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"platform_role":"SUPER_ADMIN"}'::jsonb WHERE id=v_super_user_id;

  -- Create public.users
  INSERT INTO public.users (id, full_name, is_active) VALUES
  (v_admin_user_id, 'Admin SMAN 3 Watampone', true),
  (v_super_user_id, 'Super Admin AKSIS Platform', true);

  -- Link users to school
  INSERT INTO public.school_users (id, school_id, user_id, status, joined_at) VALUES
  (v_school_user_id, v_school_id, v_admin_user_id, 'ACTIVE', now()),
  (v_super_school_user_id, v_school_id, v_super_user_id, 'ACTIVE', now());

  -- Assign Roles
  INSERT INTO public.school_user_roles (school_id, school_user_id, role_id, assigned_by) VALUES
  (v_school_id, v_school_user_id, v_role_admin, v_admin_user_id),
  (v_school_id, v_super_school_user_id, v_role_admin, v_super_user_id);

  PERFORM public.configure_school_roles(v_school_id);

  -- 5. Insert Academic Year
  INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, is_active)
  VALUES (v_academic_year_id, v_school_id, '2026/2027', '2026-07-15', '2027-06-15', true);

  -- 6. Insert Classes
  INSERT INTO public.classes (id, school_id, academic_year_id, code, name, grade_level) VALUES
  (v_class_x_a, v_school_id, v_academic_year_id, 'X-A', 'Kelas X-A', 10),
  (v_class_x_b, v_school_id, v_academic_year_id, 'X-B', 'Kelas X-B', 10),
  (v_class_xi_a, v_school_id, v_academic_year_id, 'XI-A', 'Kelas XI-A', 11),
  (v_class_xi_b, v_school_id, v_academic_year_id, 'XI-B', 'Kelas XI-B', 11),
  (v_class_xii_a, v_school_id, v_academic_year_id, 'XII-A', 'Kelas XII-A', 12),
  (v_class_xii_b, v_school_id, v_academic_year_id, 'XII-B', 'Kelas XII-B', 12);

  -- 7. Insert Dummy Students
  FOR i IN 1..30 LOOP
    DECLARE
      v_student_id UUID := gen_random_uuid();
      v_class_id UUID;
    BEGIN
      -- Assign to a random class
      v_class_id := CASE (i % 6)
        WHEN 0 THEN v_class_x_a
        WHEN 1 THEN v_class_x_b
        WHEN 2 THEN v_class_xi_a
        WHEN 3 THEN v_class_xi_b
        WHEN 4 THEN v_class_xii_a
        ELSE v_class_xii_b
      END;

      INSERT INTO public.students (id, school_id, nisn, student_number, full_name, gender, is_active)
      VALUES (
        v_student_id, v_school_id, 
        '00' || lpad(i::text, 8, '0'), 
        '26' || lpad(i::text, 4, '0'), 
        'Siswa Demo ' || i, 
        CASE WHEN i % 2 = 0 THEN 'MALE'::public.gender_type ELSE 'FEMALE'::public.gender_type END,
        true
      );

      INSERT INTO public.student_class_history (school_id, student_id, class_id, academic_year_id, start_date)
      VALUES (v_school_id, v_student_id, v_class_id, v_academic_year_id, '2026-07-15');
    END;
  END LOOP;

END $$;

COMMIT;
