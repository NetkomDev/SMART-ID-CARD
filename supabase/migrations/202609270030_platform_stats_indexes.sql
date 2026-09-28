-- Add global partial indexes for Super Admin Platform Stats to prevent Full Table Scans across tenants

-- 1. Index for Siswa aktif (total_students)
CREATE INDEX IF NOT EXISTS platform_active_students_idx 
ON public.students (id) 
WHERE is_active = true AND deleted_at IS NULL;

-- 2. Index for Perangkat online (total_devices)
CREATE INDEX IF NOT EXISTS platform_active_devices_idx 
ON public.devices (last_seen_at) 
WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- 3. Index for Kartu aktif belum kedaluwarsa (total_cards)
CREATE INDEX IF NOT EXISTS platform_active_cards_idx 
ON public.student_cards (expires_at) 
WHERE status = 'ACTIVE';
