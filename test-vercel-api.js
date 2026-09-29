require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const email = `test_vercel_${Date.now()}@aksis.local`;
  const password = "password123";
  await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: login } = await client.auth.signInWithPassword({ email, password });
  
  const refresh_token = login.session.refresh_token;
  
  const response = await fetch('https://aksis-theta.vercel.app/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token })
  });
  
  const json = await response.json().catch(e => null);
  console.log("Status:", response.status);
  console.log("Response:", json);
})();
