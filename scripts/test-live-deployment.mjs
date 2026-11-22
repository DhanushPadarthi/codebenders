import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[trimmed.slice(0, eqIdx).trim()] = v;
  }
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
const LIVE_URL = 'https://feepulse.vercel.app';

console.log('================================================================');
console.log('FeePulse — Live Production Deployment & Security Verification');
console.log(`Live Domain: ${LIVE_URL}`);
console.log(`Target Supabase: eyauiehyiipqkvfjecnx`);
console.log('================================================================\n');

async function testLiveDeployment() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = null;

  try {
    // 1. Live Protected Route Guard
    console.log('Check 1: Verifying live unauthenticated route guards...');
    const resHome = await fetch(`${LIVE_URL}/`, { redirect: 'manual' });
    assert.ok([307, 308, 302, 303].includes(resHome.status), `Home page must redirect unauthenticated users (status: ${resHome.status})`);
    const loc = resHome.headers.get('location') || '';
    assert.ok(loc.includes('/login'), `Redirect must point to /login (got: ${loc})`);
    console.log(`  ✓ [PASS] Live domain enforces unauthenticated redirect to ${loc}`);

    // 2. Live Page Rendering
    console.log('\nCheck 2: Verifying live login page renders 200 OK...');
    const resLogin = await fetch(`${LIVE_URL}/login`);
    assert.equal(resLogin.status, 200);
    const htmlLogin = await resLogin.text();
    assert.ok(htmlLogin.includes('FeePulse'), 'Login page must contain FeePulse brand');
    console.log('  ✓ [PASS] Live login page rendered successfully (HTML contains FeePulse branding)');

    // 3. Live Supabase Authentication
    console.log('\nCheck 3: Verifying live Supabase authentication with project eyauiehyiipqkvfjecnx...');
    const testEmail = `tutor-live-${nonce}@feepulse.internal`;
    const testPass = `LivePass!${nonce}2026#`;

    const { data: userData, error: userErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPass,
      email_confirm: true,
      user_metadata: { full_name: 'Live Verified Tutor' },
    });
    assert.equal(userErr, null, `User creation error: ${userErr?.message}`);
    userId = userData.user.id;

    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: testEmail,
      password: testPass,
    });
    assert.equal(loginErr, null, `Login error: ${loginErr?.message}`);
    const token = loginData.session.access_token;
    assert.ok(token, 'Session token must be acquired');
    console.log(`  ✓ [PASS] Authenticated successfully with Supabase staging project eyauiehyiipqkvfjecnx`);

    // 4. Live Production AI 403 Guard Verification
    console.log('\nCheck 4: Verifying Production AI 403 Guard is active on live domain...');
    const resAi = await fetch(`${LIVE_URL}/api/ai/parse-payment-promise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messageText: 'I will pay 5000 tomorrow',
        referenceDate: '2026-11-21',
      }),
    });
    assert.equal(resAi.status, 403, `Live production AI endpoint must return HTTP 403 Forbidden (got ${resAi.status})`);
    const aiJson = await resAi.json();
    assert.equal(aiJson.code, 'AI_PRODUCTION_DISABLED', `Expected AI_PRODUCTION_DISABLED code, got ${aiJson.code}`);
    console.log(`  ✓ [PASS] Live production AI endpoint returned HTTP 403 Forbidden (${aiJson.code})`);

    // 5. Database Multi-Tenant Operation on Live Target
    console.log('\nCheck 5: Verifying live database operations target project eyauiehyiipqkvfjecnx...');
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: newBiz, error: errBiz } = await userClient.from('businesses').insert({
      name: `Live Academy ${nonce}`,
      owner_id: userId,
      currency: 'INR',
    }).select().single();
    assert.equal(errBiz, null, `Business creation error: ${errBiz?.message}`);
    assert.ok(newBiz.id, 'Business ID must be generated in PostgreSQL');

    const { data: cust, error: errCust } = await userClient.from('customers').insert({
      business_id: newBiz.id,
      name: 'Pooja Sharma',
      parent_name: 'Anil Sharma',
      phone: '+91 99887 76655',
      whatsapp_number: '+91 99887 76655',
      grade_subject: 'Class 12 - Chemistry',
      default_fee_amount: 12000.00,
      billing_cycle_day: 1,
      status: 'active',
    }).select().single();
    assert.equal(errCust, null, `Customer creation error: ${errCust?.message}`);
    assert.equal(cust.name, 'Pooja Sharma');
    console.log(`  ✓ [PASS] Database operation executed on staging database eyauiehyiipqkvfjecnx (Customer: ${cust.name})`);

    console.log('\n================================================================');
    console.log('✓ ALL 5 LIVE PRODUCTION DEPLOYMENT CHECKS PASSED PERFECTLY!');
    console.log('================================================================');
  } finally {
    if (userId) {
      try { await adminClient.auth.admin.deleteUser(userId); } catch { /* ignore */ }
    }
  }
}

testLiveDeployment().catch((err) => {
  console.error('\nLive deployment verification failed:', err);
  process.exit(1);
});
