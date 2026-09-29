require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: qrs } = await supabase.from('qr_access_tokens').select('id, auth_user_id, role_code, revoked_at');
  console.log('QR Access Tokens:', qrs);
  
  for (const qr of qrs) {
    const { data: user, error } = await supabase.auth.admin.getUserById(qr.auth_user_id);
    console.log(`User ${qr.auth_user_id}:`, user?.user ? 'EXISTS' : 'NOT FOUND', error?.message || '');
  }
})();
