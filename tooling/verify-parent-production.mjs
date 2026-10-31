// Uses only an ephemeral QA school. All fixture rows and Auth accounts are removed in finally.
import assert from 'node:assert/strict';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
const env=dotenv.parse(await fs.readFile('.env'));
const base='https://www.aksis.co.id',ref='mzurocuwgoqwooilxuvv';assert(env.SUPABASE_URL.includes(ref));
const managementToken=process.env.SUPABASE_ACCESS_TOKEN || (await fs.readFile('.vercel/supabase-access-token','utf8')).trim();
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anonymous=()=>createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function sql(query){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{authorization:`Bearer ${managementToken}`,'content-type':'application/json'},body:JSON.stringify({query})});if(!r.ok){const error=await r.json();throw new Error(`Management SQL ${r.status}: ${error.message || error.error || 'query failed'}`);}return r.json();}
const ids={school:randomUUID(),student:randomUUID(),membership:randomUUID(),role:randomUUID()};const accounts=[];const checks=[];
async function account(label,metadata={}){const email=`qa_${label}_${randomBytes(10).toString('hex')}@aksis.local`;const r=await admin.auth.admin.createUser({email,password:randomBytes(48).toString('base64url'),email_confirm:true,app_metadata:metadata});assert(!r.error,`Create QA ${label}`);accounts.push(r.data.user.id);return r.data.user;}
async function authSession(email){const link=await admin.auth.admin.generateLink({type:'magiclink',email});assert(!link.error,'Generate QA auth link');const r=await anonymous().auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token});assert(!r.error,'Exchange QA link');return r.data.session;}
async function call(path,{body,cookie,csrf,bearer,origin=base,school}={}){const headers={origin};if(body)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;if(csrf)headers['x-csrf-token']=csrf;if(bearer)headers.authorization=`Bearer ${bearer}`;if(school)headers['x-school-id']=school;const r=await fetch(base+'/api/v1'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const data=r.status===204?null:await r.json();return{status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')};}
await fs.rm('docs/analysis/2026-10-31/parent-portal/production-flow.json',{force:true});
try{
 const manifest=await fetch(base+'/parent/manifest.webmanifest');assert.equal(manifest.status,200);assert.equal((await manifest.json()).display,'standalone');
 const worker=await fetch(base+'/parent/sw.js');assert.equal(worker.status,200);assert.match(worker.headers.get('content-type')||'',/javascript/);checks.push('PWA manifest and service worker available');
 const actor=await account('admin'),shadow=await account('schoolqr',{portal_access:true});ids.actor=actor.id;ids.shadow=shadow.id;
 const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
 await sql(`begin;
 insert into public.users(id,full_name) values('${actor.id}','QA Guardian Flow Admin'),('${shadow.id}','QA Guardian QR');
 insert into public.schools(id,code,name) values('${ids.school}','QA_${ids.school.slice(0,8).toUpperCase()}','QA Temporary Guardian Flow');
 insert into public.school_users(id,school_id,user_id,status,joined_at) values('${ids.membership}','${ids.school}','${actor.id}','ACTIVE',now());
 insert into public.roles(id,school_id,code,name) values('${ids.role}','${ids.school}','SCHOOL_ADMIN','QA Admin');
 insert into public.school_user_roles(school_id,school_user_id,role_id) values('${ids.school}','${ids.membership}','${ids.role}');
 insert into public.students(id,school_id,student_number,nisn,date_of_birth,full_name) values('${ids.student}','${ids.school}','QA01','0099887766','2010-01-02','QA Guardian Child');
 insert into public.qr_access_tokens(school_id,token_hash,auth_user_id,shadow_email,role_code,metadata) values('${ids.school}','${hash}','${shadow.id}','${shadow.email}','PARENT','{}');
 commit;`);
 await fs.writeFile('.vercel/parent-qa-fixture.json',JSON.stringify(ids),{mode:0o600});
 const body={token,nisn:'0099887766',date_of_birth:'2010-01-02',full_name:'QA Guardian',phone:'081299998877'};
 let r=await call('/parent/session/enroll',{body,origin:'https://invalid.example'});assert.equal(r.status,403);checks.push('reject foreign origin');
 r=await call('/parent/session/enroll',{body:{...body,date_of_birth:'2011-01-02'}});assert.equal(r.status,422);checks.push('reject wrong DOB');
 r=await call('/parent/session/enroll',{body});assert.equal(r.status,201,`Enrollment ${r.data?.error?.code}`);assert.deepEqual(Object.keys(r.data.data),['csrf']);assert.match(r.setCookie,/HttpOnly/i);assert.match(r.setCookie,/Secure/i);assert.match(r.setCookie,/SameSite=Strict/i);
 const old={cookie:r.cookie,csrf:r.data.data.csrf};checks.push('enroll without email/password; Secure HttpOnly cookie; no JWT in response');
 r=await call('/parent/session/context',old);assert.equal(r.status,200);ids.parent=r.data.data.user_id;accounts.push(ids.parent);
 r=await call('/parent/children',old);assert.equal(r.status,200);assert.equal(r.data.data.length,1);assert.equal(r.data.data[0].student_id,ids.student);checks.push('only linked child visible');
 r=await call(`/parent/children/${ids.student}/today`,old);assert.equal(r.status,200);checks.push('real dashboard RPC works');
 r=await call('/parent/session/enroll',{body});assert.equal(r.status,409);checks.push('WA cannot take over existing account');
 const adminSession=await authSession(actor.email);const auth={bearer:adminSession.access_token,school:ids.school};
 r=await call(`/parent/guardians?student_id=${ids.student}`,auth);assert.equal(r.status,200);assert.equal(r.data.data[0].user_id,ids.parent);checks.push('school admin lists guardian');
 r=await call('/parent/recovery-tokens',{...auth,body:{user_id:ids.parent}});assert.equal(r.status,201);const previous=r.data.data.token;
 r=await call('/parent/recovery-tokens',{...auth,body:{user_id:ids.parent}});assert.equal(r.status,201);const current=r.data.data.token;
 r=await call('/parent/session/recover-qr',{body:{token:previous}});assert.equal(r.status,401);checks.push('old QR revoked by rotation');
 r=await call('/parent/session/recover-qr',{body:{token:current}});assert.equal(r.status,200);const recovered={cookie:r.cookie,csrf:r.data.data.csrf};checks.push('personal QR restores guardian');
 r=await call('/parent/session/recover-qr',{body:{token:current}});assert.equal(r.status,401);checks.push('personal QR cannot be reused');
 r=await call('/parent/session/context',old);assert.equal(r.status,403);checks.push('lost phone session revoked');
 r=await call('/parent/children',recovered);assert.equal(r.status,200);assert.equal(r.data.data.length,1);
 r=await call('/parent/session/logout',{...recovered,body:{}});assert.equal(r.status,204);checks.push('logout revokes session');
 await fs.mkdir('docs/analysis/2026-10-31/parent-portal',{recursive:true});
 await fs.writeFile('docs/analysis/2026-10-31/parent-portal/production-flow.json',JSON.stringify({verified_at:new Date().toISOString(),base,checks,result:'PASS',fixture_cleanup:'see console / cleanup evidence'},null,2));
 console.log(`PASS: ${checks.length} production parent-flow checks`);
}finally{
 // Restrict cleanup to UUIDs created by this run and this dedicated QA school.
 const lookup=await sql(`select user_id from public.parent_portal_identities where school_id='${ids.school}'`);
 for(const r of lookup)if(!accounts.includes(r.user_id))accounts.push(r.user_id);
 const list=accounts.map(id=>`'${id}'`).join(',')||"'00000000-0000-0000-0000-000000000000'";
 await sql(`begin;
 delete from public.audit_logs where school_id='${ids.school}';
 delete from public.parent_recovery_tokens where school_id='${ids.school}';
 delete from public.parent_revoked_sessions where user_id in (${list});
 delete from public.parent_link_tokens where school_id='${ids.school}';
 delete from public.parent_student_links where school_id='${ids.school}';
 delete from public.parent_portal_identities where school_id='${ids.school}';
 delete from public.parent_profiles where user_id in (${list});
 delete from public.qr_access_tokens where school_id='${ids.school}';
 delete from public.students where school_id='${ids.school}';
 delete from public.school_user_roles where school_id='${ids.school}';
 delete from public.school_users where school_id='${ids.school}';
 delete from public.role_permissions where school_id='${ids.school}';
 delete from public.roles where school_id='${ids.school}';
 delete from public.permissions where school_id='${ids.school}';
 delete from public.users where id in (${list});
 delete from public.schools where id='${ids.school}'; commit;`);
 for(const id of accounts){const r=await admin.auth.admin.deleteUser(id);assert(!r.error,'Delete QA Auth identity');}
 await fs.rm('.vercel/parent-qa-fixture.json',{force:true});
 try { const path='docs/analysis/2026-10-31/parent-portal/production-flow.json'; const result=JSON.parse(await fs.readFile(path,'utf8')); result.fixture_cleanup='PASS: temporary QA school and all Auth fixtures removed'; await fs.writeFile(path,JSON.stringify(result,null,2)); } catch(error) { if(error.code!=='ENOENT') throw error; }
 console.log('PASS: all temporary QA school and Auth fixtures cleaned');
}
