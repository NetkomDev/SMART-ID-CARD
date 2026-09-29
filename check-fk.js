require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await supabase.rpc('execute_sql', {
    query: "SELECT * FROM information_schema.key_column_usage WHERE referenced_table_name = 'users' AND referenced_table_schema = 'auth';"
  });
  console.log(data, error);
})();
