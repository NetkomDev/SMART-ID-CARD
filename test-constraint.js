require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await supabase.rpc('execute_sql', {
    query: "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'qr_access_tokens'::regclass;"
  });
  console.log(data, error);
})();
