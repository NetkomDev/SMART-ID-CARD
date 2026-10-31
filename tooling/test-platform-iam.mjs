// Verification script for Platform IAM filter and portal 3-month protection against live Supabase
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env = dotenv.parse(await fs.readFile('.env'));
const ref = 'mzurocuwgoqwooilxuvv';
const managementToken = process.env.SUPABASE_ACCESS_TOKEN || '';
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${managementToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!r.ok) {
    const error = await r.json();
    throw new Error(`Management SQL ${r.status}: ${error.message || error.error || 'query failed'}`);
  }
  return r.json();
}

const testIds = {
  schoolA: randomUUID(),
  schoolB: randomUUID(),
  userSuper: randomUUID(),
  userPortalActive: randomUUID(),
  userPortalIdle: randomUUID(),
  membershipPortalActive: randomUUID(),
  membershipPortalIdle: randomUUID(),
  roleWaste: randomUUID(),
  roleTeacher: randomUUID(),
};

try {
  console.log('1. Setting up ephemeral test accounts and schools...');
  // Create Super Admin auth
  await admin.auth.admin.createUser({
    id: testIds.userSuper,
    email: `qa_super_${randomBytes(6).toString('hex')}@aksis.local`,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    app_metadata: { platform_role: 'SUPER_ADMIN' }
  });

  // Create Portal user 1: Logged in today (< 3 months)
  const nowIso = new Date().toISOString();
  await admin.auth.admin.createUser({
    id: testIds.userPortalActive,
    email: `qa_portal_active_${randomBytes(6).toString('hex')}@aksis.local`,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    app_metadata: { portal_access: true }
  });

  // Create Portal user 2: Logged in 4 months ago (> 3 months)
  const fourMonthsAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  await admin.auth.admin.createUser({
    id: testIds.userPortalIdle,
    email: `qa_portal_idle_${randomBytes(6).toString('hex')}@aksis.local`,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    app_metadata: { portal_access: true }
  });

  // Seed DB records and set last_sign_in_at
  await sql(`
    BEGIN;
    INSERT INTO public.users(id, full_name) VALUES
      ('${testIds.userSuper}', 'QA Super Admin'),
      ('${testIds.userPortalActive}', 'QA Portal Active Staff'),
      ('${testIds.userPortalIdle}', 'QA Portal Idle Staff');

    INSERT INTO public.schools(id, code, name) VALUES
      ('${testIds.schoolA}', 'QA_SCH_A', 'QA Test School A'),
      ('${testIds.schoolB}', 'QA_SCH_B', 'QA Test School B');

    INSERT INTO public.roles(id, school_id, code, name) VALUES
      ('${testIds.roleWaste}', '${testIds.schoolA}', 'PORTAL_WASTE_STAFF', 'Portal Waste Staff'),
      ('${testIds.roleTeacher}', '${testIds.schoolB}', 'PORTAL_TEACHER', 'Portal Teacher');

    INSERT INTO public.school_users(id, school_id, user_id, status, joined_at) VALUES
      ('${testIds.membershipPortalActive}', '${testIds.schoolA}', '${testIds.userPortalActive}', 'ACTIVE', now()),
      ('${testIds.membershipPortalIdle}', '${testIds.schoolB}', '${testIds.userPortalIdle}', 'ACTIVE', now());

    INSERT INTO public.school_user_roles(school_id, school_user_id, role_id) VALUES
      ('${testIds.schoolA}', '${testIds.membershipPortalActive}', '${testIds.roleWaste}'),
      ('${testIds.schoolB}', '${testIds.membershipPortalIdle}', '${testIds.roleTeacher}');

    -- Update auth.users last_sign_in_at directly for testing conditions
    UPDATE auth.users SET last_sign_in_at = '${nowIso}' WHERE id = '${testIds.userPortalActive}';
    UPDATE auth.users SET last_sign_in_at = '${fourMonthsAgo}' WHERE id = '${testIds.userPortalIdle}';
    COMMIT;
  `);

  console.log('2. Testing platform_get_iam with and without school_id filter...');
  // Create super admin client
  const superPassword = 'SuperPassword123!QA';
  await admin.auth.admin.updateUserById(testIds.userSuper, { password: superPassword });
  const superClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: loginErr } = await superClient.auth.signInWithPassword({
    email: (await admin.auth.admin.getUserById(testIds.userSuper)).data.user.email,
    password: superPassword
  });
  assert(!loginErr, 'Super admin login');
  const authedClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: resAll, error: errAll } = await authedClient.rpc('platform_get_iam', { p_limit: 30, p_offset: 0, p_school_id: null });
  assert(!errAll, `platform_get_iam all schools: ${errAll?.message}`);
  assert(resAll.length >= 2, 'platform_get_iam should return records across all schools');

  const { data: resFilterA, error: errA } = await authedClient.rpc('platform_get_iam', { p_limit: 30, p_offset: 0, p_school_id: testIds.schoolA });
  assert(!errA, `platform_get_iam school A: ${errA?.message}`);
  assert.equal(resFilterA.length, 1, 'Filter for School A should return exactly 1 record');
  assert.equal(resFilterA[0].school_id, testIds.schoolA);
  assert.equal(resFilterA[0].full_name, 'QA Portal Active Staff');

  const { data: resFilterB, error: errB } = await authedClient.rpc('platform_get_iam', { p_limit: 30, p_offset: 0, p_school_id: testIds.schoolB });
  assert(!errB, `platform_get_iam school B: ${errB?.message}`);
  assert.equal(resFilterB.length, 1, 'Filter for School B should return exactly 1 record');
  assert.equal(resFilterB[0].school_id, testIds.schoolB);
  assert.equal(resFilterB[0].full_name, 'QA Portal Idle Staff');

  console.log('3. Testing 3-month protection on deactivation (Active -> Suspended)...');
  // Attempt to deactivate userPortalActive (logged in today) -> must fail!
  const { data: deactActive, error: deactActiveErr } = await authedClient.rpc('platform_update_membership', {
    p_id: testIds.membershipPortalActive,
    p_status: 'SUSPENDED',
    p_roles: ['PORTAL_WASTE_STAFF']
  });
  assert(deactActiveErr !== null, 'Deactivation of portal user with recent login must fail');
  assert.match(deactActiveErr.message, /PORTAL_ACTIVE_RECENTLY/, 'Deactivation error message');
  console.log('   ✓ Blocked deactivation of active portal user successfully');

  // Attempt to deactivate userPortalIdle (logged in 4 months ago) -> must succeed!
  const { data: deactIdle, error: deactIdleErr } = await authedClient.rpc('platform_update_membership', {
    p_id: testIds.membershipPortalIdle,
    p_status: 'SUSPENDED',
    p_roles: ['PORTAL_TEACHER']
  });
  assert(!deactIdleErr, `Deactivation of idle user: ${deactIdleErr?.message}`);
  assert.equal(deactIdle.status, 'SUSPENDED');
  console.log('   ✓ Deactivation of idle portal user (> 3 months) succeeded');

  console.log('4. Testing 3-month protection on deletion (Hapus)...');
  // Attempt to delete userPortalActive (logged in today) -> must fail!
  const { data: delActive, error: delActiveErr } = await authedClient.rpc('platform_delete_school_user', {
    p_id: testIds.membershipPortalActive
  });
  assert(delActiveErr !== null, 'Deletion of portal user with recent login must fail');
  assert.match(delActiveErr.message, /PORTAL_ACTIVE_RECENTLY/, 'Deletion error message');
  console.log('   ✓ Blocked deletion of active portal user successfully');

  // Attempt to delete userPortalIdle (logged in 4 months ago) -> must succeed!
  const { error: delIdleErr } = await authedClient.rpc('platform_delete_school_user', {
    p_id: testIds.membershipPortalIdle
  });
  assert(!delIdleErr, `Deletion of idle user: ${delIdleErr?.message}`);

  const checkDeleted = await sql(`
    SELECT status, deleted_at FROM public.school_users WHERE id = '${testIds.membershipPortalIdle}';
  `);
  assert.equal(checkDeleted[0].status, 'REVOKED');
  assert(checkDeleted[0].deleted_at !== null, 'User must be marked deleted');
  console.log('   ✓ Deletion of idle portal user (> 3 months) succeeded');

  console.log('PASS: All database & business logic requirements verified against production Supabase!');
} finally {
  console.log('5. Cleaning up ephemeral test records...');
  try {
    await sql(`
      BEGIN;
      DELETE FROM public.audit_logs WHERE school_id IN ('${testIds.schoolA}', '${testIds.schoolB}');
      DELETE FROM public.school_user_roles WHERE school_id IN ('${testIds.schoolA}', '${testIds.schoolB}');
      DELETE FROM public.school_users WHERE school_id IN ('${testIds.schoolA}', '${testIds.schoolB}');
      DELETE FROM public.roles WHERE school_id IN ('${testIds.schoolA}', '${testIds.schoolB}');
      DELETE FROM public.schools WHERE id IN ('${testIds.schoolA}', '${testIds.schoolB}');
      DELETE FROM public.users WHERE id IN ('${testIds.userSuper}', '${testIds.userPortalActive}', '${testIds.userPortalIdle}');
      COMMIT;
    `);
    await admin.auth.admin.deleteUser(testIds.userSuper).catch(() => {});
    await admin.auth.admin.deleteUser(testIds.userPortalActive).catch(() => {});
    await admin.auth.admin.deleteUser(testIds.userPortalIdle).catch(() => {});
    console.log('   ✓ Cleanup completed.');
  } catch (e) {
    console.warn('Cleanup warning:', e.message);
  }
}
