require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const uid = '64c50986-e20b-4803-b4a7-38580a74e2d3';
  const schoolId = '64133fc4-bb02-445c-9aea-79592c0550b1';
  
  const { data: q } = await supabase.from('qr_access_tokens').select('*').eq('auth_user_id', uid).single();
  const { data: su } = await supabase.from('school_users').select('*').eq('user_id', uid).eq('school_id', schoolId).single();
  const { data: s } = await supabase.from('schools').select('*').eq('id', schoolId).single();
  const { data: u } = await supabase.from('users').select('*').eq('id', uid).single();
  
  console.log("q valid:", q && !q.revoked_at && (!q.expires_at || new Date(q.expires_at) > new Date()));
  console.log("su valid:", su && su.status === 'ACTIVE' && su.deleted_at === null);
  console.log("s valid:", s && s.status === 'ACTIVE' && s.is_active && s.deleted_at === null);
  console.log("u valid:", u && u.is_active && u.deleted_at === null);
})();
