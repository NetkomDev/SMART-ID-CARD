require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const userId = '86056bf4-d5b8-4318-8ad3-d904e32f47c8';
  const { data, error } = await supabase.from('users').delete().eq('id', userId);
  console.log('Delete public.users:', error?.message);
})();
