require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const uid = '64c50986-e20b-4803-b4a7-38580a74e2d3';
  try {
    console.log("Deleting user...");
    const cleanup = await supabase.auth.admin.deleteUser(uid);
    console.log("Cleanup:", cleanup);
  } catch (error) {
    console.error("Exception thrown:", error);
  }
})();
