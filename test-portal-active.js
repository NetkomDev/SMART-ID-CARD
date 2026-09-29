require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers();
  const targetId = '64c50986-e20b-4803-b4a7-38580a74e2d3';
  
  // Call portal_session_active as this user!
  // To do this, we need a JWT for this user.
  // Since we don't know the password, we can simulate the query.
  
  const query = `
    select 1 from public.qr_access_tokens q
    join public.school_users su on su.user_id=q.auth_user_id and su.school_id=q.school_id
    join public.schools s on s.id=q.school_id join public.users u on u.id=q.auth_user_id
    where q.auth_user_id='64c50986-e20b-4803-b4a7-38580a74e2d3' and q.revoked_at is null and(q.expires_at is null or q.expires_at>now())
     and su.status='ACTIVE' and su.deleted_at is null and s.status='ACTIVE' and s.is_active and s.deleted_at is null
     and u.is_active and u.deleted_at is null;
  `;
  
  // we can use a raw sql execute? No, we can query the view.
  const { data, error } = await supabase.from('qr_access_tokens')
    .select(`
      id,
      school_users!inner(status, deleted_at),
      schools!inner(status, is_active, deleted_at),
      users!inner(is_active, deleted_at)
    `)
    .eq('auth_user_id', '64c50986-e20b-4803-b4a7-38580a74e2d3')
    .is('revoked_at', null);
    
  console.log("Session query data:", JSON.stringify(data, null, 2));
  if (error) console.log("Error:", error);
})();
