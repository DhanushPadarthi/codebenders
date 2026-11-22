import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_REF = 'eyauiehyiipqkvfjecnx';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

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

// Safety gate: must pass before any write
let urlRef = '';
try {
  urlRef = new URL(SUPABASE_URL).hostname.split('.supabase.co')[0];
} catch {
  urlRef = '';
}
const projectRefPath = path.resolve('supabase/.temp/project-ref');
const targetRef = fs.existsSync(projectRefPath) ? fs.readFileSync(projectRefPath, 'utf8').trim() : '';
if (urlRef !== EXPECTED_REF || targetRef !== EXPECTED_REF) {
  console.error(`FAIL: Safety gate rejected target (url ref: ${urlRef || 'unparseable'}, project-ref: ${targetRef || 'missing'}; expected ${EXPECTED_REF})`);
  process.exit(1);
}

console.log('================================================================');
console.log('FeePulse Cross-Tenant Invoice Regression Test (Business A vs Business B)');
console.log('DATABASE-CONSTRAINT and RLS integration test: exercises the same Postgres UPDATE');
console.log('that updateDraftInvoice performs, through an authenticated client. It does NOT');
console.log('import or execute lib/dal/invoices.ts or the Server Action, which depend on');
console.log('next/headers and the Next runtime.');
console.log('================================================================');
console.log(`Safety gate: project ref ${EXPECTED_REF} — gate passed\n`);

// Track results
const testResults = [];
function report(caseNum, name, status, detail = '') {
  testResults.push({ caseNum, name, status, detail });
  const icon = status === 'PASS' ? '✓' : '✗';
  console.log(`  ${icon} [Case ${caseNum}: ${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

function redact(text) {
  return String(text ?? '').replace(UUID_RE, '<uuid>');
}

const authOpts = { auth: { autoRefreshToken: false, persistSession: false } };

// Admin client: setup and teardown only
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, authOpts);

// Anon client: used only for signInWithPassword
const anonClient = createClient(SUPABASE_URL, ANON_KEY, authOpts);

function createUserClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    ...authOpts,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function runCase(caseNum, name, fn) {
  try {
    const { status, detail } = await fn();
    report(caseNum, name, status, detail);
  } catch (err) {
    report(caseNum, name, 'FAIL', `threw: ${redact(err?.message)}`);
  }
}

async function fetchBusiness(client, ownerId, label) {
  const { data, error } = await client.from('businesses').select('*').eq('owner_id', ownerId).single();
  if (error || !data) throw new Error(`Business ${label} not provisioned: ${redact(error?.message)}`);
  return data;
}

async function insertCustomer(client, businessId, label, name, phone) {
  const { data, error } = await client
    .from('customers')
    .insert({
      business_id: businessId,
      name,
      parent_name: 'XT Parent',
      grade_subject: 'XT Subject',
      phone,
      whatsapp_number: phone,
      default_fee_amount: 6000.00,
      billing_cycle_day: 1,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`Failed to create customer ${label}: ${redact(error?.message)}`);
  return data;
}

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const emailA = `test-xt-a-${nonce}@feepulse.internal`;
  const emailB = `test-xt-b-${nonce}@feepulse.internal`;
  const password = `TestPass!${nonce}2026#`;
  const b1Name = `XT Test B1 ${nonce}`;
  const b1Phone = '+910000000003';

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;
  let bizA = null;
  let bizB = null;
  let custA1 = null;
  let custA2 = null;
  let custB1 = null;
  let invId = null;
  let originalCustomerId = null;
  let currentCustomerId = null;
  let setupError = null;
  let cleanupFailed = false;

  try {
    // ------------------------------------------------------------------------
    // SETUP
    // ------------------------------------------------------------------------
    console.log('Setup: provisioning two isolated tenants, customers and a draft invoice...');

    const { data: authA, error: errAuthA } = await adminClient.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'XT Tenant Alpha' },
    });
    if (errAuthA || !authA?.user) throw new Error(`Failed creating user A: ${redact(errAuthA?.message)}`);
    userAId = authA.user.id;

    const { data: authB, error: errAuthB } = await adminClient.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'XT Tenant Beta' },
    });
    if (errAuthB || !authB?.user) throw new Error(`Failed creating user B: ${redact(errAuthB?.message)}`);
    userBId = authB.user.id;

    const { data: loginA, error: errLoginA } = await anonClient.auth.signInWithPassword({ email: emailA, password });
    if (errLoginA || !loginA?.session) throw new Error(`User A login failed: ${redact(errLoginA?.message)}`);
    clientA = createUserClient(loginA.session.access_token);

    const { data: loginB, error: errLoginB } = await anonClient.auth.signInWithPassword({ email: emailB, password });
    if (errLoginB || !loginB?.session) throw new Error(`User B login failed: ${redact(errLoginB?.message)}`);
    clientB = createUserClient(loginB.session.access_token);

    bizA = await fetchBusiness(clientA, userAId, 'A');
    bizB = await fetchBusiness(clientB, userBId, 'B');

    custA1 = await insertCustomer(clientA, bizA.id, 'A1', `XT Test A1 ${nonce}`, '+910000000001');
    custA2 = await insertCustomer(clientA, bizA.id, 'A2', `XT Test A2 ${nonce}`, '+910000000002');
    custB1 = await insertCustomer(clientB, bizB.id, 'B1', b1Name, b1Phone);

    const { data: inv, error: errInv } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: custA1.id,
        invoice_number: 'XT-' + nonce + '-0001',
        issue_date: '2026-11-21',
        due_date: '2026-11-28',
        subtotal: 0,
        discount: 0,
        total_amount: 0,
        notes: 'XT regression fixture',
      })
      .select('*')
      .single();
    if (errInv || !inv) throw new Error(`Failed to create draft invoice: ${redact(errInv?.message)}`);
    invId = inv.id;
    originalCustomerId = custA1.id;
    console.log('Setup complete.\n');

    console.log('Cases:');

    // ------------------------------------------------------------------------
    // CASE 1: POSITIVE CONTROL
    // ------------------------------------------------------------------------
    await runCase(1, 'Positive control: Business A reassigns own customer on own draft', async () => {
      const { data, error } = await clientA
        .from('invoices')
        .update({ customer_id: custA2.id })
        .eq('id', invId)
        .eq('business_id', bizA.id)
        .select('id, customer_id');
      if (error) return { status: 'FAIL', detail: `update error: ${redact(error.message)}` };
      if (!data || data.length !== 1 || data[0].customer_id !== custA2.id) {
        return { status: 'FAIL', detail: `expected 1 row with own customer, got ${data?.length ?? 0} rows` };
      }
      currentCustomerId = custA2.id;
      return { status: 'PASS', detail: 'same-tenant customer assignment accepted' };
    });

    // ------------------------------------------------------------------------
    // CASE 2: CROSS-TENANT ATTEMPT
    // ------------------------------------------------------------------------
    await runCase(2, 'Cross-tenant attempt: Business A assigns Business B customer', async () => {
      const { data, error } = await clientA
        .from('invoices')
        .update({ customer_id: custB1.id })
        .eq('id', invId)
        .eq('business_id', bizA.id)
        .select('id, customer_id');
      const rows = data ?? [];
      if (!error && rows.some((r) => r.customer_id === custB1.id)) {
        return { status: 'FAIL', detail: 'cross-tenant assignment succeeded' };
      }
      if (!error && rows.length > 0) return { status: 'FAIL', detail: 'unexpected row returned' };
      if (error) {
        return { status: 'PASS', detail: `rejected (code ${error.code ?? 'none'}: ${redact(error.message)})` };
      }
      return { status: 'PASS', detail: 'rejected (no row updated)' };
    });

    // ------------------------------------------------------------------------
    // CASE 3: PERSISTENCE
    // ------------------------------------------------------------------------
    await runCase(3, 'Persistence: rejected attempt left customer assignment unchanged', async () => {
      const { data, error } = await clientA.from('invoices').select('id, customer_id').eq('id', invId).single();
      if (error || !data) return { status: 'FAIL', detail: `read error: ${redact(error?.message)}` };
      if (data.customer_id !== currentCustomerId) {
        return { status: 'FAIL', detail: 'customer_id changed after rejected attempt' };
      }
      const note = data.customer_id !== originalCustomerId ? ' (differs from setup value by Case 1)' : '';
      return { status: 'PASS', detail: `customer_id unchanged by rejected attempt${note}` };
    });

    // ------------------------------------------------------------------------
    // CASE 4: READ ISOLATION
    // ------------------------------------------------------------------------
    await runCase(4, 'Read isolation: Business A cannot read Business B customer', async () => {
      const { data: joined, error: joinErr } = await clientA
        .from('invoices')
        .select('id, customer_id, customers(id, name, phone, business_id)')
        .eq('id', invId)
        .single();
      if (joinErr || !joined) return { status: 'FAIL', detail: `join read error: ${redact(joinErr?.message)}` };

      const nested = [].concat(joined.customers ?? []);
      const forbidden = [custB1.id, b1Name, b1Phone, bizB.id];
      const joinLeaks = nested.some((c) => Object.values(c).some((v) => forbidden.includes(v)));
      const joinMatches = nested.length === 0 || nested.every((c) => c.id === custA2.id);
      const joinOk = joinMatches && !joinLeaks;

      const { data: direct, error: directErr } = await clientA.from('customers').select('id').eq('id', custB1.id);
      if (directErr) return { status: 'FAIL', detail: `customers read error code ${directErr.code ?? 'none'}` };
      const directEmpty = (direct ?? []).length === 0;

      const joinText = nested.length === 0 ? 'null' : joinMatches ? 'matches Case 1 customer' : 'does not match Case 1 customer';
      const detail = `invoice join ${joinOk ? 'clean' : 'LEAKED'} (${joinText}); direct B1 read returned ${directEmpty ? 'no rows' : 'a row'}`;
      return { status: joinOk && directEmpty ? 'PASS' : 'FAIL', detail };
    });

    // ------------------------------------------------------------------------
    // CASE 5: BUSINESS B CONTROL
    // ------------------------------------------------------------------------
    await runCase(5, 'Business B control: own data visible, Business A invoice hidden', async () => {
      const { data: ownCust, error: ownErr } = await clientB
        .from('customers')
        .select('id, name')
        .eq('id', custB1.id)
        .single();
      const { data: bInvs, error: bInvsErr } = await clientB.from('invoices').select('id').eq('business_id', bizB.id);
      const { data: aInv, error: aInvErr } = await clientB.from('invoices').select('id').eq('id', invId);

      const ownOk = !ownErr && ownCust?.id === custB1.id;
      const listOk = !bInvsErr && Array.isArray(bInvs);
      const hiddenOk = !aInvErr && (aInv ?? []).length === 0;
      const detail = `own customer row ${ownOk ? 'visible' : 'missing'}; own invoice list ${listOk ? 'ok' : 'error'}; Business A invoice ${hiddenOk ? 'hidden' : 'VISIBLE or error'}`;
      return { status: ownOk && listOk && hiddenOk ? 'PASS' : 'FAIL', detail };
    });
  } catch (err) {
    setupError = err;
    console.log(`  ✗ SETUP FAIL: ${redact(err?.message)}`);
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: delete only rows this test created, by explicit id
    // ------------------------------------------------------------------------
    console.log('\nCleanup:');
    const failedSteps = [];

    if (invId) {
      const { error } = await adminClient.from('invoices').delete().eq('id', invId);
      if (error) failedSteps.push(`invoices (${redact(error.message)})`);
    }

    const customerIds = [custA1, custA2, custB1].filter(Boolean).map((c) => c.id);
    if (customerIds.length > 0) {
      const { error } = await adminClient.from('customers').delete().in('id', customerIds);
      if (error) failedSteps.push(`customers (${redact(error.message)})`);
    }

    const businessIds = [bizA, bizB].filter(Boolean).map((b) => b.id);
    if (businessIds.length > 0) {
      const { error } = await adminClient.from('businesses').delete().in('id', businessIds);
      if (error) failedSteps.push(`businesses (${redact(error.message)})`);
    }

    if (userAId) {
      const { error } = await adminClient.auth.admin.deleteUser(userAId);
      if (error) failedSteps.push(`deleteUser A (${redact(error.message)})`);
    }

    if (userBId) {
      const { error } = await adminClient.auth.admin.deleteUser(userBId);
      if (error) failedSteps.push(`deleteUser B (${redact(error.message)})`);
    }

    if (failedSteps.length === 0) {
      console.log('Cleanup: completed');
    } else {
      cleanupFailed = true;
      console.log(`Cleanup: failed at ${failedSteps.join('; ')}`);
    }
  }

  // ------------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------------
  const passCount = testResults.filter((r) => r.status === 'PASS').length;
  const failCount = testResults.length - passCount;
  console.log(`\nSummary: ${passCount} PASS, ${failCount} FAIL${setupError ? ', setup error' : ''}`);

  if (failCount > 0 || setupError || cleanupFailed) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error(`FAIL: unexpected error: ${redact(err?.message)}`);
  process.exitCode = 1;
});
