require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const userId = '86056bf4-d5b8-4318-8ad3-d904e32f47c8';
  
  await supabase.from('parent_student_links').delete().eq('parent_user_id', userId);
  await supabase.from('parent_profiles').delete().eq('user_id', userId);
  await supabase.from('qr_access_tokens').delete().eq('auth_user_id', userId);
  
  const { data: su } = await supabase.from('school_users').select('id').eq('user_id', userId);
  if (su && su.length > 0) {
    for (const s of su) {
      await supabase.from('school_user_roles').delete().eq('school_user_id', s.id);
    }
    await supabase.from('school_users').delete().eq('user_id', userId);
  }
  
  await supabase.from('users').delete().eq('id', userId);
  
  const { data, error } = await supabase.auth.admin.deleteUser(userId);
  console.log('Delete auth user result:', data, 'Error:', error?.message);
})();
