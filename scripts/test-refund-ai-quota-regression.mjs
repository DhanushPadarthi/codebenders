/**
 * Runtime regression for refund_ai_quota. Requires the corrective migration applied to a LOCAL Supabase instance. Refuses the hosted staging project.
 *
 * Usage: node scripts/test-refund-ai-quota-regression.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Verify and load environment variables from .env.local
const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  console.error('FAIL: .env.local not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const k = trimmed.slice(0, eqIdx).trim();
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const ANON_KEY = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('FAIL: Missing required Supabase credentials in .env.local');
  process.exit(1);
}

// SAFETY GATE: local instance only. Checked before any write.
let targetHost = '';
try {
  targetHost = new URL(SUPABASE_URL).hostname;
} catch {
  targetHost = '';
}
if (targetHost !== '127.0.0.1' && targetHost !== 'localhost') {
  console.log('REFUSED: runs only against a local Supabase instance');
  process.exit(2);
}

const CLIENT_OPTS = { auth: { autoRefreshToken: false, persistSession: false } };
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, CLIENT_OPTS);

// Authenticated client using a user's bearer token
function userClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...CLIENT_OPTS,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Sign in through a fresh anon client and return an authenticated client
async function signIn(email, password) {
  const anon = createClient(SUPABASE_URL, ANON_KEY, CLIENT_OPTS);
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error('sign-in failed for fixture user');
  return userClient(data.session.access_token);
}

// Read-only quota lookup via the service client
async function readUsed(businessId) {
  const { data, error } = await adminClient
    .from('ai_usage_quotas')
    .select('used_credits')
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw new Error(`quota read failed: ${error.message}`);
  return data ? data.used_credits : 0;
}

async function consume(client, businessId, userId) {
  const { data, error } = await client.rpc('consume_ai_quota', {
    p_business_id: businessId,
    p_user_id: userId,
    p_endpoint: 'regression-test',
    p_model: 'regression-test',
    p_credits: 1,
    p_max_requests_per_minute: 30,
  });
  if (error || !data || data.allowed !== true || !data.request_log_id) {
    throw new Error(`consume_ai_quota did not allow the request (${error?.message ?? data?.code ?? 'unknown'})`);
  }
  return data.request_log_id;
}

async function refund(client, businessId, userId, requestLogId, credits) {
  return client.rpc('refund_ai_quota', {
    p_business_id: businessId,
    p_user_id: userId,
    p_request_log_id: requestLogId,
    p_credits: credits,
  });
}

// Rejected = RPC error or success:false
function isRejected(res) {
  return !!res.error || res.data?.success === false;
}

function outcomeCode(res) {
  if (res.error) return 'RPC_ERROR';
  return res.data?.code ?? (res.data?.success === false ? 'SUCCESS_FALSE' : 'NONE');
}

// Track results
const results = [];
function report(caseNum, caseName, pass, detail = '') {
  results.push({ caseNum, caseName, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} [Case ${caseNum}] ${caseName}${detail ? ' — ' + detail : ''}`);
}

async function runCase(caseNum, caseName, fn) {
  try {
    const { pass, detail } = await fn();
    report(caseNum, caseName, pass, detail);
  } catch (err) {
    report(caseNum, caseName, false, `error: ${err.message}`);
  }
}

console.log('================================================================');
console.log('FeePulse refund_ai_quota Runtime Regression (local instance)');
console.log('================================================================\n');

async function main() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const emailA = `test-refund-a-${nonce}@feepulse.internal`;
  const emailB = `test-refund-b-${nonce}@feepulse.internal`;
  const password = `RefundTest!${nonce}2026#`;

  let userA = null;
  let userB = null;
  let aborted = false;

  try {
    // ------------------------------------------------------------------
    // SETUP: two fixture users via Admin API
    // ------------------------------------------------------------------
    console.log('Phase 1: Provisioning ephemeral test users...');

    const { data: authA, error: errAuthA } = await adminClient.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errAuthA || !authA.user) throw new Error('createUser A failed');
    userA = authA.user.id;

    const { data: authB, error: errAuthB } = await adminClient.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (errAuthB || !authB.user) throw new Error('createUser B failed');
    userB = authB.user.id;

    const clientA = await signIn(emailA, password);
    const clientB = await signIn(emailB, password);

    // Business per owner, fetched through the owner's own client
    const { data: bizA, error: errBizA } = await clientA
      .from('businesses')
      .select('id')
      .eq('owner_id', userA)
      .single();
    if (errBizA || !bizA) throw new Error('business lookup failed for fixture user A');

    const { data: bizB, error: errBizB } = await clientB
      .from('businesses')
      .select('id')
      .eq('owner_id', userB)
      .single();
    if (errBizB || !bizB) throw new Error('business lookup failed for fixture user B');

    console.log('Phase 2: Running refund_ai_quota regression cases...');

    // Case 1: NULL request id from authenticated A must be rejected
    await runCase(1, 'NULL request id from authenticated caller rejected', async () => {
      const before = await readUsed(bizA.id);
      const res = await refund(clientA, bizA.id, userA, null, 1);
      const after = await readUsed(bizA.id);
      const pass = isRejected(res) && after === before;
      return { pass, detail: `code=${outcomeCode(res)} used ${before}->${after}` };
    });

    // Case 2: valid consumed request refunded by its owner
    let logA1 = null;
    await runCase(2, 'valid consumed request refunded by owner', async () => {
      logA1 = await consume(clientA, bizA.id, userA);
      const before = await readUsed(bizA.id);
      const res = await refund(clientA, bizA.id, userA, logA1, 1);
      const after = await readUsed(bizA.id);
      const pass =
        !res.error &&
        res.data?.success === true &&
        res.data?.refunded_credits === 1 &&
        after === before - 1;
      return { pass, detail: `refunded=${res.data?.refunded_credits ?? 'n/a'} used ${before}->${after}` };
    });

    // Case 3: same request again must be ALREADY_REFUNDED
    await runCase(3, 'same request refunded twice returns ALREADY_REFUNDED', async () => {
      const before = await readUsed(bizA.id);
      const res = await refund(clientA, bizA.id, userA, logA1, 1);
      const after = await readUsed(bizA.id);
      const pass = !res.error && res.data?.code === 'ALREADY_REFUNDED' && after === before;
      return { pass, detail: `code=${outcomeCode(res)} used ${before}->${after}` };
    });

    // Case 4: random UUID as request id must be REQUEST_NOT_FOUND
    await runCase(4, 'random request UUID returns REQUEST_NOT_FOUND', async () => {
      const before = await readUsed(bizA.id);
      const res = await refund(clientA, bizA.id, userA, crypto.randomUUID(), 1);
      const after = await readUsed(bizA.id);
      const pass = res.data?.code === 'REQUEST_NOT_FOUND' && after === before;
      return { pass, detail: `code=${outcomeCode(res)} used ${before}->${after}` };
    });

    // Case 5: B's consumed request refunded by A using A's business and user
    await runCase(5, "A refunds B's request using A's business and user", async () => {
      const logB = await consume(clientB, bizB.id, userB);
      const beforeA = await readUsed(bizA.id);
      const beforeB = await readUsed(bizB.id);
      const res = await refund(clientA, bizA.id, userA, logB, 1);
      const afterA = await readUsed(bizA.id);
      const afterB = await readUsed(bizB.id);
      const pass = isRejected(res) && afterA === beforeA && afterB === beforeB;
      return {
        pass,
        detail: `code=${outcomeCode(res)} usedA ${beforeA}->${afterA} usedB ${beforeB}->${afterB}`,
      };
    });

    // Case 6: non-positive credits must be rejected (0 and -1)
    await runCase(6, 'p_credits 0 and -1 rejected as INVALID_CREDITS', async () => {
      const logA6 = await consume(clientA, bizA.id, userA);
      const before = await readUsed(bizA.id);
      const res0 = await refund(clientA, bizA.id, userA, logA6, 0);
      const resNeg = await refund(clientA, bizA.id, userA, logA6, -1);
      const after = await readUsed(bizA.id);
      const pass =
        res0.data?.code === 'INVALID_CREDITS' &&
        resNeg.data?.code === 'INVALID_CREDITS' &&
        after === before;
      return {
        pass,
        detail: `codes=${outcomeCode(res0)},${outcomeCode(resNeg)} used ${before}->${after}`,
      };
    });

    // Case 7: credits above logged amount are capped at logged credits_used
    await runCase(7, 'p_credits 5 capped to logged credits_used 1', async () => {
      const logA7 = await consume(clientA, bizA.id, userA);
      const before = await readUsed(bizA.id);
      const res = await refund(clientA, bizA.id, userA, logA7, 5);
      const after = await readUsed(bizA.id);
      const pass =
        !res.error &&
        res.data?.success === true &&
        res.data?.refunded_credits === 1 &&
        after === before - 1;
      return { pass, detail: `refunded=${res.data?.refunded_credits ?? 'n/a'} used ${before}->${after}` };
    });
  } catch (err) {
    aborted = true;
    console.log(`  FAIL: setup/run aborted — ${err.message}`);
  } finally {
    // Guaranteed cleanup of fixture users
    console.log('\nPhase 3: Cleanup...');
    for (const id of [userA, userB]) {
      if (!id) continue;
      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) {
        aborted = true;
        console.log(`  FAIL: cleanup could not delete a fixture user (${error.message})`);
      }
    }
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log('\n================================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} cases run`);
  console.log('================================================================');

  if (aborted || failed > 0 || results.length !== 7) {
    process.exitCode = 1;
  }
}

main();
