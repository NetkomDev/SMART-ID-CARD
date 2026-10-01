-- Seed data for SD, SMP, SMA Schools and Admins

BEGIN;

DO $$
DECLARE
  v_super_user_id UUID := '11a7e2ce-4afe-4517-a286-f0bfc2d6997c';
  
  -- Schools
  v_sd_school_id UUID := gen_random_uuid();
  v_smp_school_id UUID := gen_random_uuid();
  v_sma_school_id UUID := gen_random_uuid();
  
  -- Admins
  v_sd_admin_id UUID := gen_random_uuid();
  v_smp_admin_id UUID := gen_random_uuid();
  v_sma_admin_id UUID := gen_random_uuid();

  -- Academic Years
  v_sd_ay_id UUID := gen_random_uuid();
  v_smp_ay_id UUID := gen_random_uuid();
  v_sma_ay_id UUID := gen_random_uuid();
  
  -- Helper variables
  v_school_user_id UUID;
  v_super_school_user_id UUID;
  v_role_admin_id UUID;
  v_class_id UUID;
  v_student_id UUID;

  -- Class IDs
  v_sd_c1 UUID := gen_random_uuid();
  v_sd_c2 UUID := gen_random_uuid();
  v_sd_c3 UUID := gen_random_uuid();
  v_sd_c4 UUID := gen_random_uuid();
  v_sd_c5 UUID := gen_random_uuid();
  v_sd_c6 UUID := gen_random_uuid();

  v_smp_c7a UUID := gen_random_uuid();
  v_smp_c7b UUID := gen_random_uuid();
  v_smp_c8a UUID := gen_random_uuid();
  v_smp_c8b UUID := gen_random_uuid();
  v_smp_c9a UUID := gen_random_uuid();
  v_smp_c9b UUID := gen_random_uuid();

  v_sma_c10a UUID := gen_random_uuid();
  v_sma_c10b UUID := gen_random_uuid();
  v_sma_c11a UUID := gen_random_uuid();
  v_sma_c11b UUID := gen_random_uuid();
  v_sma_c12a UUID := gen_random_uuid();
  v_sma_c12b UUID := gen_random_uuid();

BEGIN
  -----------------------------------------------------------------------------
  -- 1. INSERT SCHOOLS
  -----------------------------------------------------------------------------
  INSERT INTO public.schools (id, code, name, timezone, is_active) VALUES
  (v_sd_school_id, 'SDN1WTP', 'SD Negeri 1 Watampone', 'Asia/Makassar', true),
  (v_smp_school_id, 'SMPN1WTP', 'SMP Negeri 1 Watampone', 'Asia/Makassar', true),
  (v_sma_school_id, 'SMAN3WTP', 'SMA Negeri 3 Watampone', 'Asia/Makassar', true);

  -----------------------------------------------------------------------------
  -- 2. CONFIGURE ROLES & PERMISSIONS FOR ALL SCHOOLS
  -----------------------------------------------------------------------------
  PERFORM public.configure_school_roles(v_sd_school_id);
  PERFORM public.configure_school_roles(v_smp_school_id);
  PERFORM public.configure_school_roles(v_sma_school_id);

  -----------------------------------------------------------------------------
  -- 3. CREATE AUTH & PUBLIC USERS FOR SCHOOL ADMINS & SUPER ADMIN IF MISSING
  -----------------------------------------------------------------------------
  -- Super Admin
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_super_user_id) THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
      created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data
    ) VALUES (
      v_super_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
      'superadmin@aksis.co.id', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', '', '{"platform_role":"SUPER_ADMIN"}'::jsonb
    );
    INSERT INTO public.users (id, full_name, is_active) VALUES
    (v_super_user_id, 'Super Admin AKSIS Platform', true);
  END IF;

  -- Admin SD
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_sd_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
    'admin.sdn1wtp@aksis.co.id', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''
  );
  INSERT INTO public.users (id, full_name, phone, is_active) VALUES
  (v_sd_admin_id, 'Siti Nurhaliza, S.Pd. (Admin SD)', '081234567001', true);

  -- Admin SMP
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_smp_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
    'admin.smpn1wtp@aksis.co.id', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''
  );
  INSERT INTO public.users (id, full_name, phone, is_active) VALUES
  (v_smp_admin_id, 'Budi Santoso, M.Pd. (Admin SMP)', '081234567002', true);

  -- Admin SMA
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_sma_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 
    'admin.sman3wtp@aksis.co.id', crypt('password123', gen_salt('bf')), now(), now(), now(), '', '', '', ''
  );
  INSERT INTO public.users (id, full_name, phone, is_active) VALUES
  (v_sma_admin_id, 'Andi Akbar, S.T. (Admin SMA)', '081234567003', true);

  -----------------------------------------------------------------------------
  -- 4. LINK ADMIN USERS & SUPER ADMIN TO SCHOOLS
  -----------------------------------------------------------------------------
  -- SD Links
  v_school_user_id := gen_random_uuid();
  INSERT INTO public.school_users (id, school_id, user_id, status, joined_at)
  VALUES (v_school_user_id, v_sd_school_id, v_sd_admin_id, 'ACTIVE', now());
  SELECT id INTO v_role_admin_id FROM public.roles WHERE school_id = v_sd_school_id AND code = 'SCHOOL_ADMIN';
  INSERT INTO public.school_user_roles (school_id, school_user_id, role_id, assigned_by)
  VALUES (v_sd_school_id, v_school_user_id, v_role_admin_id, v_sd_admin_id);

  v_super_school_user_id := gen_random_uuid();
  INSERT INTO public.school_users (id, school_id, user_id, status, joined_at)
  VALUES (v_super_school_user_id, v_sd_school_id, v_super_user_id, 'ACTIVE', now());
  INSERT INTO public.school_user_roles (school_id, school_user_id, role_id, assigned_by)
  VALUES (v_sd_school_id, v_super_school_user_id, v_role_admin_id, v_super_user_id);

  -- SMP Links
  v_school_user_id := gen_random_uuid();
  INSERT INTO public.school_users (id, school_id, user_id, status, joined_at)
  VALUES (v_school_user_id, v_smp_school_id, v_smp_admin_id, 'ACTIVE', now());
  SELECT id INTO v_role_admin_id FROM public.roles WHERE school_id = v_smp_school_id AND code = 'SCHOOL_ADMIN';
  INSERT INTO public.school_user_roles (school_id, school_user_id, role_id, assigned_by)
  VALUES (v_smp_school_id, v_school_user_id, v_role_admin_id, v_smp_admin_id);

  v_super_school_user_id := gen_random_uuid();
  INSERT INTO public.school_users (id, school_id, user_id, status, joined_at)
  VALUES (v_super_school_user_id, v_smp_school_id, v_super_user_id, 'ACTIVE', now());
  INSERT INTO public.school_user_roles (school_id, school_user_id, role_id, assigned_by)
  VALUES (v_smp_school_id, v_super_school_user_id, v_role_admin_id, v_super_user_id);

  -- SMA Links
  v_school_user_id := gen_random_uuid();
  INSERT INTO public.school_users (id, school_id, user_id, status, joined_at)
  VALUES (v_school_user_id, v_sma_school_id, v_sma_admin_id, 'ACTIVE', now());
  SELECT id INTO v_role_admin_id FROM public.roles WHERE school_id = v_sma_school_id AND code = 'SCHOOL_ADMIN';
  INSERT INTO public.school_user_roles (school_id, school_user_id, role_id, assigned_by)
  VALUES (v_sma_school_id, v_school_user_id, v_role_admin_id, v_sma_admin_id);

  v_super_school_user_id := gen_random_uuid();
  INSERT INTO public.school_users (id, school_id, user_id, status, joined_at)
  VALUES (v_super_school_user_id, v_sma_school_id, v_super_user_id, 'ACTIVE', now());
  INSERT INTO public.school_user_roles (school_id, school_user_id, role_id, assigned_by)
  VALUES (v_sma_school_id, v_super_school_user_id, v_role_admin_id, v_super_user_id);

  -----------------------------------------------------------------------------
  -- 5. ACADEMIC YEARS
  -----------------------------------------------------------------------------
  INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, is_active) VALUES
  (v_sd_ay_id, v_sd_school_id, '2026/2027', '2026-07-15', '2027-06-15', true),
  (v_smp_ay_id, v_smp_school_id, '2026/2027', '2026-07-15', '2027-06-15', true),
  (v_sma_ay_id, v_sma_school_id, '2026/2027', '2026-07-15', '2027-06-15', true);

  -----------------------------------------------------------------------------
  -- 6. CLASSES
  -----------------------------------------------------------------------------
  -- SD Classes (Grades 1-6)
  INSERT INTO public.classes (id, school_id, academic_year_id, code, name, grade_level) VALUES
  (v_sd_c1, v_sd_school_id, v_sd_ay_id, '1-A', 'Kelas 1-A', 1),
  (v_sd_c2, v_sd_school_id, v_sd_ay_id, '2-A', 'Kelas 2-A', 2),
  (v_sd_c3, v_sd_school_id, v_sd_ay_id, '3-A', 'Kelas 3-A', 3),
  (v_sd_c4, v_sd_school_id, v_sd_ay_id, '4-A', 'Kelas 4-A', 4),
  (v_sd_c5, v_sd_school_id, v_sd_ay_id, '5-A', 'Kelas 5-A', 5),
  (v_sd_c6, v_sd_school_id, v_sd_ay_id, '6-A', 'Kelas 6-A', 6);

  -- SMP Classes (Grades 7-9)
  INSERT INTO public.classes (id, school_id, academic_year_id, code, name, grade_level) VALUES
  (v_smp_c7a, v_smp_school_id, v_smp_ay_id, 'VII-A', 'Kelas VII-A', 7),
  (v_smp_c7b, v_smp_school_id, v_smp_ay_id, 'VII-B', 'Kelas VII-B', 7),
  (v_smp_c8a, v_smp_school_id, v_smp_ay_id, 'VIII-A', 'Kelas VIII-A', 8),
  (v_smp_c8b, v_smp_school_id, v_smp_ay_id, 'VIII-B', 'Kelas VIII-B', 8),
  (v_smp_c9a, v_smp_school_id, v_smp_ay_id, 'IX-A', 'Kelas IX-A', 9),
  (v_smp_c9b, v_smp_school_id, v_smp_ay_id, 'IX-B', 'Kelas IX-B', 9);

  -- SMA Classes (Grades 10-12)
  INSERT INTO public.classes (id, school_id, academic_year_id, code, name, grade_level) VALUES
  (v_sma_c10a, v_sma_school_id, v_sma_ay_id, 'X-A', 'Kelas X-A', 10),
  (v_sma_c10b, v_sma_school_id, v_sma_ay_id, 'X-B', 'Kelas X-B', 10),
  (v_sma_c11a, v_sma_school_id, v_sma_ay_id, 'XI-A', 'Kelas XI-A', 11),
  (v_sma_c11b, v_sma_school_id, v_sma_ay_id, 'XI-B', 'Kelas XI-B', 11),
  (v_sma_c12a, v_sma_school_id, v_sma_ay_id, 'XII-A', 'Kelas XII-A', 12),
  (v_sma_c12b, v_sma_school_id, v_sma_ay_id, 'XII-B', 'Kelas XII-B', 12);

  -----------------------------------------------------------------------------
  -- 7. STUDENTS SD (30 Students)
  -----------------------------------------------------------------------------
  FOR i IN 1..30 LOOP
    v_student_id := gen_random_uuid();
    v_class_id := CASE 
      WHEN i <= 5 THEN v_sd_c1
      WHEN i <= 10 THEN v_sd_c2
      WHEN i <= 15 THEN v_sd_c3
      WHEN i <= 20 THEN v_sd_c4
      WHEN i <= 25 THEN v_sd_c5
      ELSE v_sd_c6
    END;

    INSERT INTO public.students (id, school_id, nisn, student_number, full_name, gender, is_active)
    VALUES (
      v_student_id, v_sd_school_id,
      '00' || lpad((10000 + i)::text, 8, '0'),
      '10' || lpad(i::text, 3, '0'),
      (ARRAY[
        'Achmad Rayhan', 'Anisa Fitriani', 'Aliyyah Putri', 'Muhammad Bilal', 'Nabila Syakirah',
        'Dimas Pratama', 'Faqih Alfian', 'Zahra Humaira', 'Sultan Fadhil', 'Clarissa Qanita',
        'Habibie Asyraf', 'Naurah Hasna', 'Fathan Mubarak', 'Rania Azzahra', 'Wildan Kenzie',
        'Hafiz Zulkarnain', 'Kaylah Maharani', 'Muhammad Rizky', 'Sabrina Aulia', 'Dzaky Mubarak',
        'Atharizz Calief', 'Felicia Naura', 'Adrian Setiawan', 'Nadira Safiya', 'Kenzo Hamizan',
        'Reyhan Ramadhan', 'Syifa Nuraini', 'Arya Kusuma', 'Dania Talita', 'Farhan Maulana'
      ])[i],
      CASE WHEN i % 2 = 1 THEN 'MALE'::public.gender_type ELSE 'FEMALE'::public.gender_type END,
      true
    );

    INSERT INTO public.student_class_history (school_id, student_id, class_id, academic_year_id, start_date)
    VALUES (v_sd_school_id, v_student_id, v_class_id, v_sd_ay_id, '2026-07-15');
  END LOOP;

  -----------------------------------------------------------------------------
  -- 8. STUDENTS SMP (30 Students)
  -----------------------------------------------------------------------------
  FOR i IN 1..30 LOOP
    v_student_id := gen_random_uuid();
    v_class_id := CASE 
      WHEN i <= 5 THEN v_smp_c7a
      WHEN i <= 10 THEN v_smp_c7b
      WHEN i <= 15 THEN v_smp_c8a
      WHEN i <= 20 THEN v_smp_c8b
      WHEN i <= 25 THEN v_smp_c9a
      ELSE v_smp_c9b
    END;

    INSERT INTO public.students (id, school_id, nisn, student_number, full_name, gender, is_active)
    VALUES (
      v_student_id, v_smp_school_id,
      '00' || lpad((20000 + i)::text, 8, '0'),
      '20' || lpad(i::text, 3, '0'),
      (ARRAY[
        'Ageng Pangestu', 'Aisyah Kirana', 'Bagas Ardiansyah', 'Cinta Laura', 'Devano Danendra',
        'Erlangga Saputra', 'Fiona Nabila', 'Gathan Pratama', 'Hana Humaira', 'Irfan Fauzi',
        'Jovan Malik', 'Keysha Az-Zahra', 'Lingga Buana', 'Mutia Anggraini', 'Naufal Athalla',
        'Olivia Stefani', 'Pandu Wirawan', 'Qonita Luthfia', 'Restu Permana', 'Salsabila Rahma',
        'Taraka Adiyasa', 'Utari Pramesti', 'Vanno Alghifari', 'Winda Lestari', 'Xavier Putra',
        'Yasmin Shafira', 'Zaidan Hidayat', 'Aris Munandar', 'Bella Safitri', 'Cakra Wijaya'
      ])[i],
      CASE WHEN i % 2 = 1 THEN 'MALE'::public.gender_type ELSE 'FEMALE'::public.gender_type END,
      true
    );

    INSERT INTO public.student_class_history (school_id, student_id, class_id, academic_year_id, start_date)
    VALUES (v_smp_school_id, v_student_id, v_class_id, v_smp_ay_id, '2026-07-15');
  END LOOP;

  -----------------------------------------------------------------------------
  -- 9. STUDENTS SMA (30 Students)
  -----------------------------------------------------------------------------
  FOR i IN 1..30 LOOP
    v_student_id := gen_random_uuid();
    v_class_id := CASE 
      WHEN i <= 5 THEN v_sma_c10a
      WHEN i <= 10 THEN v_sma_c10b
      WHEN i <= 15 THEN v_sma_c11a
      WHEN i <= 20 THEN v_sma_c11b
      WHEN i <= 25 THEN v_sma_c12a
      ELSE v_sma_c12b
    END;

    INSERT INTO public.students (id, school_id, nisn, student_number, full_name, gender, is_active)
    VALUES (
      v_student_id, v_sma_school_id,
      '00' || lpad((30000 + i)::text, 8, '0'),
      '30' || lpad(i::text, 3, '0'),
      (ARRAY[
        'Andi Baso', 'Andi Tenri', 'Muhammad Fadil', 'Nurul Inayah', 'Rahmat Hidayat',
        'Sultan Hasanuddin', 'Resky Amelia', 'Ahmad Faisal', 'Dian Ekawati', 'Farhan Syah',
        'Kaharuddin', 'Mutiara Pertiwi', 'Ilham Ramadhan', 'Rahmawati', 'Syahrul Gunawan',
        'Nur Syamsi', 'Wahyu Hidayat', 'Fitriani Safitri', 'Muhammad Syukri', 'Tari Maharani',
        'Andi Batara', 'Maghfira Putri', 'Ridwan Kamil', 'Hasna Mutmainnah', 'Firman Utama',
        'Nurbaeti', 'Muhammad Arshad', 'Suci Rahmadani', 'Tommy Kurniawan', 'Vina Panduwinata'
      ])[i],
      CASE WHEN i % 2 = 1 THEN 'MALE'::public.gender_type ELSE 'FEMALE'::public.gender_type END,
      true
    );

    INSERT INTO public.student_class_history (school_id, student_id, class_id, academic_year_id, start_date)
    VALUES (v_sma_school_id, v_student_id, v_class_id, v_sma_ay_id, '2026-07-15');
  END LOOP;

END $$;

COMMIT;
