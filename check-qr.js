require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error } = await supabase.from('qr_access_tokens').select('*').limit(5);
  console.log("Tokens:", data);
})();
