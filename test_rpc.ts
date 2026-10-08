import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing URL or Key in env");
  process.exit(1);
}
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.rpc('link_student_to_parent_portal', {
    p_nisn: '0075849305',
    p_dob: '2008-05-22',
    p_parent_name: 'Andi Akbar',
    p_device_id: 'test-device-123'
  });
  console.log('Result:', data);
  console.log('Error:', error);
}
run();
