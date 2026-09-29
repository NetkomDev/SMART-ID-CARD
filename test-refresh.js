require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Try to sign in as a test user or create a user to test refresh token
  const email = `test_refresh_${Date.now()}@aksis.local`;
  const password = "password123";
  const { data: user, error: createError } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) { console.error("Create failed", createError); return; }
  
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) { console.error("Login failed", loginError); return; }
  
  const refresh_token = login.session.refresh_token;
  console.log("Got refresh token");
  
  // Try to refresh via API (we can just call the Supabase refresh directly like the API does)
  const { data: refresh, error: refreshError } = await client.auth.refreshSession({ refresh_token });
  if (refreshError) {
    console.error("Refresh failed", refreshError);
  } else {
    console.log("Refresh succeeded");
  }
  
  await supabase.auth.admin.deleteUser(user.user.id);
})();
