require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const email = `test_refresh_${Date.now()}@aksis.local`;
  const password = "password123";
  await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: login } = await client.auth.signInWithPassword({ email, password });
  
  let refresh_token = login.session.refresh_token;
  
  // Refresh 1
  const r1 = await client.auth.refreshSession({ refresh_token });
  console.log("R1 success:", !r1.error);
  
  // Refresh 2 with OLD token
  const r2 = await client.auth.refreshSession({ refresh_token });
  console.log("R2 (old token) success:", !r2.error);
  
  // Refresh 3 with NEW token
  const r3 = await client.auth.refreshSession({ refresh_token: r1.data.session.refresh_token });
  console.log("R3 (new token) success:", !r3.error);
})();
