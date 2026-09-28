// Explicit operator tool. No school role is inferred or auto-promoted.
import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
const [action,userId]=process.argv.slice(2);
if(!['grant','revoke'].includes(action)||!userId||!/^[0-9a-f-]{36}$/i.test(userId))throw Error('Usage: node tooling/platform-authority.mjs grant|revoke <verified-auth-user-uuid>');
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Trusted Supabase URL and service-role key are required');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await client.auth.admin.getUserById(userId);if(error)throw error;
if(data.user.app_metadata?.portal_access)throw Error('Portal identities cannot be platform administrators');
const profile=await client.from('users').select('id,is_active,deleted_at').eq('id',userId).single();if(profile.error)throw profile.error;
if(!profile.data.is_active||profile.data.deleted_at)throw Error('An active application profile is required');
const metadata={...data.user.app_metadata};if(action==='grant')metadata.platform_role='SUPER_ADMIN';else delete metadata.platform_role;
const updated=await client.auth.admin.updateUserById(userId,{app_metadata:metadata});if(updated.error)throw updated.error;
console.log(`${action==='grant'?'Granted':'Revoked'} platform authority for ${userId}. Sign in again to refresh the interface.`);
