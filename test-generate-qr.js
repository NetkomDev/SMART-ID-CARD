import { createClient } from '@supabase/supabase-js';

const client = createClient(
  'https://mzurocuwgoqwooilxuvv.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: school } = await client.from('schools').select('id').limit(1).single();
  const schoolId = school.id;
  console.log("School ID:", schoolId);

  const { data: user } = await client.from('users').select('id').limit(1).single();
  const userId = user.id;

  const result = await client.rpc('provision_portal_access', {
    p_school_id: schoolId,
    p_user_id: crypto.randomUUID(),
    p_actor_id: userId,
    p_email: 'test' + Date.now() + '@shadow.aksis.co.id',
    p_token_hash: 'testhash' + Date.now(),
    p_role_code: 'LIBRARY_STAFF',
    p_metadata: {}
  });

  console.log("Result:", result);
}

run();
