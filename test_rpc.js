const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'apps/api/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
