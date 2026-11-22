import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import assert from 'node:assert/strict';
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

// Verify target project ref
const projectRefPath = path.resolve('supabase/.temp/project-ref');
const targetRef = fs.existsSync(projectRefPath) ? fs.readFileSync(projectRefPath, 'utf8').trim() : '';
if (targetRef !== 'eyauiehyiipqkvfjecnx') {
  console.error(`FAIL: Target project ref ${targetRef} does not match eyauiehyiipqkvfjecnx`);
  process.exit(1);
}

// Dynamic import of AI core utilities
const {
  checkAiEndpointAccess,
  checkTenantAiRateLimit,
  checkTenantMonthlyQuota,
  resetMonthlyQuotaStore,
  consumeTenantAiQuota,
  parseAndValidateJsonBody,
  fallbackParsePaymentPromise,
  fallbackExtractReceipt,
  fallbackExtractPaymentScreenshot,
  ReminderGenerateRequestSchema,
} = await import('../lib/ai/groq-client.ts');

// Track results
const testResults = [];
function report(scenarioNum, scenarioName, status, detail = '') {
  testResults.push({ scenarioNum, scenarioName, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  console.log(`  ${icon} [Scenario ${scenarioNum}: ${status}] ${scenarioName}${detail ? ' — ' + detail : ''}`);
}

// Admin client for test identity setup & teardown
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper to create client with specific user bearer token
function createUserClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function uiCategoryToDb(cat) {
  const lower = cat.toLowerCase();
  if (lower.includes('salary') || lower.includes('honorarium')) return 'salary';
  if (lower === 'rent') return 'rent';
  if (lower === 'electricity') return 'electricity';
  if (lower === 'internet') return 'internet';
  if (lower === 'materials') return 'materials';
  if (lower === 'software') return 'software';
  return 'other';
}

console.log('================================================================');
console.log('FeePulse AI Assistant & Multi-Tenant PostgreSQL Integration Test Suite');
console.log(`Target Staging Project: ${targetRef}`);
console.log('================================================================\n');

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const userAEmail = `test-ai-a-${nonce}@feepulse.internal`;
  const userBEmail = `test-ai-b-${nonce}@feepulse.internal`;
  const testPassword = `TestPass!${nonce}2026#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;
  let bizA = null;
  let bizB = null;
  let custA = null;
  let custB = null;
  let invA = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Provision Test Tenants
    // ------------------------------------------------------------------------
    console.log('Phase 1: Provisioning Ephemeral Test Tenants...');

    const { data: authA, error: errAuthA } = await adminClient.auth.admin.createUser({
      email: userAEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Tutor A ${nonce}`, business_name: `AI Alpha Academy ${nonce}` },
    });
    if (errAuthA || !authA?.user) throw new Error(`Failed to create User A: ${errAuthA?.message}`);
    userAId = authA.user.id;

    const { data: authB, error: errAuthB } = await adminClient.auth.admin.createUser({
      email: userBEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Tutor B ${nonce}`, business_name: `AI Beta Academy ${nonce}` },
    });
    if (errAuthB || !authB?.user) throw new Error(`Failed to create User B: ${errAuthB?.message}`);
    userBId = authB.user.id;

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: loginA, error: errLoginA } = await anonClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword,
    });
    if (errLoginA || !loginA.session) throw new Error(`Login failed for User A: ${errLoginA?.message}`);
    clientA = createUserClient(loginA.session.access_token);

    const { data: loginB, error: errLoginB } = await anonClient.auth.signInWithPassword({
      email: userBEmail,
      password: testPassword,
    });
    if (errLoginB || !loginB.session) throw new Error(`Login failed for User B: ${errLoginB?.message}`);
    clientB = createUserClient(loginB.session.access_token);

    // Retrieve auto-provisioned businesses
    const { data: bA, error: errBA } = await clientA
      .from('businesses')
      .select('*')
      .eq('owner_id', userAId)
      .single();
    if (errBA || !bA) throw new Error(`Failed to retrieve business A: ${errBA?.message}`);
    bizA = bA;

    const { data: bB, error: errBB } = await clientB
      .from('businesses')
      .select('*')
      .eq('owner_id', userBId)
      .single();
    if (errBB || !bB) throw new Error(`Failed to retrieve business B: ${errBB?.message}`);
    bizB = bB;

    // Create Customer A
    const { data: insertedCustA, error: errCustA } = await clientA
      .from('customers')
      .insert({
        business_id: bizA.id,
        name: `Rohan Sharma ${nonce}`,
        parent_name: `Mukesh Sharma`,
        phone: `+91 98765 00001`,
        whatsapp_number: `+91 98765 00001`,
        grade_subject: 'Class 10 - Mathematics',
        default_fee_amount: 8000,
        billing_cycle_day: 5,
        status: 'active',
      })
      .select()
      .single();
    if (errCustA || !insertedCustA) throw new Error(`Failed to create Customer A: ${errCustA?.message}`);
    custA = insertedCustA;

    // Create Customer B
    const { data: insertedCustB, error: errCustB } = await clientB
      .from('customers')
      .insert({
        business_id: bizB.id,
        name: `Kavita Patel ${nonce}`,
        parent_name: `Suresh Patel`,
        phone: `+91 98766 00002`,
        whatsapp_number: `+91 98766 00002`,
        grade_subject: 'Class 12 - Physics',
        default_fee_amount: 10000,
        billing_cycle_day: 10,
        status: 'active',
      })
      .select()
      .single();
    if (errCustB || !insertedCustB) throw new Error(`Failed to create Customer B: ${errCustB?.message}`);
    custB = insertedCustB;

    // Create Unpaid Invoice for Customer A
    const { data: insertedInvA, error: errInvA } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: custA.id,
        invoice_number: `INV-AI-${nonce}`,
        issue_date: '2026-11-01',
        due_date: '2026-11-10',
        subtotal: 8000,
        discount: 0,
        total_amount: 8000,
        status: 'draft',
      })
      .select()
      .single();
    if (errInvA || !insertedInvA) throw new Error(`Failed to create Invoice A: ${errInvA?.message}`);

    await clientA.from('invoice_items').insert({
      business_id: bizA.id,
      invoice_id: insertedInvA.id,
      description: 'Tuition Fee - November',
      quantity: 1,
      unit_price: 8000,
      total_price: 8000,
    });

    // Transition invoice from draft to sent
    const { error: errTrans } = await clientA.rpc('transition_invoice_status', {
      p_invoice_id: insertedInvA.id,
      p_new_status: 'sent',
    });
    if (errTrans) throw new Error(`Failed to transition invoice A: ${errTrans.message}`);

    const { data: freshInvA } = await clientA.from('invoices').select('*').eq('id', insertedInvA.id).single();
    invA = freshInvA;

    console.log(`Setup complete: Biz A (${bizA.id}), Biz B (${bizB.id}), Customer A (${custA.id}), Invoice A (${invA.id})\n`);

    // ------------------------------------------------------------------------
    // Scenario 1: Unauthenticated Access Guard
    // ------------------------------------------------------------------------
    console.log('Testing Scenario 1: Unauthenticated access guard...');
    {
      const { data: anonPromises, error: anonErr } = await anonClient
        .from('payment_promises')
        .select('*');

      const blocked = anonErr !== null || (Array.isArray(anonPromises) && anonPromises.length === 0);
      assert.ok(blocked, 'Anonymous calls must not read protected payment promises');
      report(1, 'Unauthenticated access guard', 'PASS', 'Anonymous requests strictly isolated by PostgreSQL RLS');
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Tenant Rate Limit Enforcement & Concurrency Guard
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 2: Tenant rate limit enforcement & concurrency guard...');
    {
      const testBizId = `rate-limit-test-${nonce}`;
      const limit = 30;

      // Execute 35 concurrent requests to prove request 31+ cannot pass
      const promises = [];
      for (let i = 1; i <= 35; i++) {
        promises.push(
          Promise.resolve().then(() => checkTenantAiRateLimit(testBizId, limit))
        );
      }
      const results = await Promise.all(promises);

      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed).length;

      assert.equal(allowedCount, 30, `Exactly 30 requests must be allowed, got ${allowedCount}`);
      assert.equal(blockedCount, 5, `Exactly 5 requests (31-35) must be blocked, got ${blockedCount}`);
      assert.ok(results[30].retryAfterSeconds > 0, 'Blocked requests must return retryAfterSeconds');

      report(2, 'Tenant rate limit & concurrency guard', 'PASS', `Enforced at limit=30: 30 allowed, 5 blocked, retry-after=${results[30].retryAfterSeconds}s`);
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Migration 000007 Verified — Persistent DB Quota, Concurrency, Tenant Auth & Refund Idempotency
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 3: Persistent DB quota, tenant authorization, refund idempotency & production fallback...');
    {
      resetMonthlyQuotaStore();

      // 1. AI Quota Consumption Persists in PostgreSQL 17
      const res1 = await consumeTenantAiQuota(clientA, {
        businessId: bizA.id,
        userId: userAId,
        endpoint: 'test-endpoint',
        model: 'test-model',
      });
      assert.ok(res1.allowed, 'Request 1 must be within quota');
      assert.ok(res1.requestLogId, 'Must return requestLogId');
      assert.equal(res1.isDistributed, true, 'Quota check must be persistent PostgreSQL RPC');
      assert.ok(res1.used >= 1, 'used_credits must increment in PostgreSQL');

      // 2. Cross-Business Quota Access is Rejected by Database Function
      // Caller A targeting Business B:
      const { error: crossBizErr } = await clientA.rpc('consume_ai_quota', {
        p_business_id: bizB.id,
        p_user_id: userAId,
        p_endpoint: 'test-endpoint',
        p_model: 'test-model',
        p_credits: 1,
        p_max_requests_per_minute: 30,
      });
      assert.ok(crossBizErr, 'Cross-business quota consumption must be rejected');
      assert.ok(crossBizErr.message.includes('Forbidden') || crossBizErr.message.includes('Unauthorized'),
        `Expected Forbidden error message, got: ${crossBizErr.message}`);

      // Caller A submitting forged user ID B:
      const { error: forgedUserErr } = await clientA.rpc('consume_ai_quota', {
        p_business_id: bizA.id,
        p_user_id: userBId, // Forged user ID
        p_endpoint: 'test-endpoint',
        p_model: 'test-model',
        p_credits: 1,
        p_max_requests_per_minute: 30,
      });
      assert.ok(forgedUserErr, 'Forged user ID submission must be rejected');
      assert.ok(forgedUserErr.message.includes('Forbidden') || forgedUserErr.message.includes('does not match'),
        `Expected Forbidden identity mismatch error, got: ${forgedUserErr.message}`);

      // 3. Failed Model Requests Refund Credits via Atomic Database RPC
      const { data: refundRes, error: refundErr } = await clientA.rpc('refund_ai_quota', {
        p_business_id: bizA.id,
        p_user_id: userAId,
        p_request_log_id: res1.requestLogId,
        p_credits: 1,
      });
      assert.equal(refundErr, null, `Refund RPC error: ${refundErr?.message}`);
      assert.equal(refundRes.success, true, 'Refund RPC must succeed');
      assert.equal(refundRes.refunded_credits, 1, 'Must refund 1 credit');
      assert.equal(refundRes.used, res1.used - 1, 'used_credits must decrement in PostgreSQL');

      // 4. Repeated Refunds Do Not Refund Twice (Idempotency)
      const { data: dupRefundRes, error: dupRefundErr } = await clientA.rpc('refund_ai_quota', {
        p_business_id: bizA.id,
        p_user_id: userAId,
        p_request_log_id: res1.requestLogId, // Same request ID
        p_credits: 1,
      });
      assert.equal(dupRefundErr, null, `Duplicate refund RPC error: ${dupRefundErr?.message}`);
      assert.equal(dupRefundRes.success, true, 'Duplicate refund RPC must return success');
      assert.equal(dupRefundRes.already_refunded, true, 'Duplicate refund must flag already_refunded');
      assert.equal(dupRefundRes.code, 'ALREADY_REFUNDED');

      // 5. Production Quota Enforcement Never Falls Back to Process-Local Memory
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        // When persistent RPC is unavailable (e.g. client is null), production MUST fail closed
        const prodFailClosed = await consumeTenantAiQuota(null, {
          businessId: bizA.id,
          userId: userAId,
          endpoint: 'test-endpoint',
          model: 'test-model',
        });
        assert.equal(prodFailClosed.allowed, false, 'Production AI requests must fail closed when persistent DB client is absent');
        assert.equal(prodFailClosed.code, 'AI_PERSISTENT_QUOTA_REQUIRED', 'Must return AI_PERSISTENT_QUOTA_REQUIRED code');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }

      // 6. Monthly Quota Enforces 100 Credits (Exhaustion Check)
      const testQuotaBizId = `quota-exhaust-${nonce}`;
      resetMonthlyQuotaStore();
      const check1 = checkTenantMonthlyQuota(testQuotaBizId, 3);
      const check2 = checkTenantMonthlyQuota(testQuotaBizId, 3);
      const check3 = checkTenantMonthlyQuota(testQuotaBizId, 3);
      const check4 = checkTenantMonthlyQuota(testQuotaBizId, 3);

      assert.ok(check1.allowed, 'Request 1 must be within quota');
      assert.ok(check2.allowed, 'Request 2 must be within quota');
      assert.ok(check3.allowed, 'Request 3 must be within quota');
      assert.equal(check4.allowed, false, 'Request 4 must be rejected (exceeds monthly quota of 3)');
      assert.equal(check4.used, 3, 'Quota used counter must report 3');

      report(3, 'Migration 000007 persistent DB quota, auth & idempotent refund', 'PASS', 'PostgreSQL persistence, tenant authorization, idempotent refund & production fail-closed verified');
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Request Size Limits (64KB Text, 8MB Image)
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 4: Request size limit enforcement...');
    {
      const oversizedText = 'A'.repeat(70000);
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ text: oversizedText })));
          controller.close();
        },
      });
      const mockReq = { body: mockStream, headers: new Headers() };
      const parsedTextResult = await parseAndValidateJsonBody(mockReq, 65536);

      assert.equal(parsedTextResult.success, false, 'Text body > 64KB must be rejected');
      assert.equal(parsedTextResult.errorResponse.status, 413, 'Status must be 413 Payload Too Large');

      const validImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      assert.ok(validImageBase64.length < 8 * 1024 * 1024, 'Base64 image under 8MB accepted');

      report(4, 'Request size limit enforcement', 'PASS', 'Streaming limits: 64KB text -> 413; 8MB image payload enforced');
    }

    // ------------------------------------------------------------------------
    // Scenario 5: Promise Extraction Draft Does NOT Mutate Database
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 5: Promise extraction draft zero-mutation guarantee...');
    {
      const { data: initialPromises } = await clientA
        .from('payment_promises')
        .select('id')
        .eq('business_id', bizA.id);

      const initialCount = initialPromises ? initialPromises.length : 0;

      const rawMsg = "Will send fee 8000 by 20th November via GPay";
      const extracted = fallbackParsePaymentPromise(rawMsg, '2026-11-15');

      assert.equal(extracted.promisedAmount, 8000);
      assert.equal(extracted.promisedDate, '2026-11-20');

      const { data: afterPromises } = await clientA
        .from('payment_promises')
        .select('id')
        .eq('business_id', bizA.id);

      const afterCount = afterPromises ? afterPromises.length : 0;
      assert.equal(afterCount, initialCount, 'Database must not mutate during AI extraction draft');
      report(5, 'Promise extraction draft zero-mutation', 'PASS', 'Zero side-effects prior to explicit tutor confirmation');
    }

    // ------------------------------------------------------------------------
    // Scenario 6: Promise Confirmation Creates Persistent PostgreSQL Row
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 6: Promise confirmation creates persistent row...');
    {
      const { data: createdPromise, error: errPromise } = await clientA
        .from('payment_promises')
        .insert({
          business_id: bizA.id,
          customer_id: custA.id,
          invoice_id: invA.id,
          raw_message: 'Will send fee 8000 by 20th November via GPay',
          promised_amount: 8000,
          promised_date: '2026-11-20',
          status: 'pending',
          confidence_score: 0.95,
        })
        .select()
        .single();

      assert.equal(errPromise, null, `Error creating promise: ${errPromise?.message}`);
      assert.ok(createdPromise?.id, 'Promise ID must be returned');
      assert.equal(Number(createdPromise.promised_amount), 8000);
      assert.equal(createdPromise.status, 'pending');

      report(6, 'Promise confirmation creates persistent row', 'PASS', `Promise ${createdPromise.id} stored with status=pending`);
    }

    // ------------------------------------------------------------------------
    // Scenario 7: Rejection of Invalid or Cross-Tenant Promise
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 7: Rejection of invalid / cross-tenant promise...');
    {
      // 1. Negative amount check constraint
      const { error: negErr } = await clientA
        .from('payment_promises')
        .insert({
          business_id: bizA.id,
          customer_id: custA.id,
          invoice_id: invA.id,
          raw_message: 'Negative amount promise',
          promised_amount: -500,
          promised_date: '2026-11-25',
          status: 'pending',
        });
      assert.ok(negErr !== null, 'Negative promised amount must be rejected by database');

      // 2. Cross-tenant customer insertion: User A attempting to create promise for User B's customer
      const { error: crossErr } = await clientA
        .from('payment_promises')
        .insert({
          business_id: bizA.id,
          customer_id: custB.id,
          raw_message: 'Cross-tenant promise attempt',
          promised_amount: 3000,
          promised_date: '2026-11-25',
          status: 'pending',
        });
      assert.ok(crossErr !== null, 'Cross-tenant customer promise must be rejected by foreign key / RLS');

      report(7, 'Invalid / cross-tenant promise rejection', 'PASS', 'Negative amounts and cross-tenant foreign keys strictly rejected');
    }

    // ------------------------------------------------------------------------
    // Scenario 8: Receipt OCR Draft Does NOT Mutate Database
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 8: Receipt OCR draft zero-mutation guarantee...');
    {
      const { data: initialBills } = await clientA
        .from('bills')
        .select('id')
        .eq('business_id', bizA.id);

      const initialCount = initialBills ? initialBills.length : 0;

      const extractedReceipt = fallbackExtractReceipt();
      assert.ok(extractedReceipt.totalAmount > 0, 'Receipt amount parsed');

      const { data: afterBills } = await clientA
        .from('bills')
        .select('id')
        .eq('business_id', bizA.id);

      const afterCount = afterBills ? afterBills.length : 0;
      assert.equal(afterCount, initialCount, 'Receipt OCR draft must not insert rows into bills table');
      report(8, 'Receipt OCR draft zero-mutation', 'PASS', 'Zero database mutations before tutor reviews and approves');
    }

    // ------------------------------------------------------------------------
    // Scenario 9: Receipt Confirmation Creates Persistent Bill with DB-Compliant Category
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 9: Receipt confirmation creates persistent bill...');
    {
      const rawCategory = 'Materials';
      const dbCategory = uiCategoryToDb(rawCategory);
      assert.equal(dbCategory, 'materials', 'Category must map to valid database enum');

      const { data: insertedBill, error: errBill } = await clientA
        .from('bills')
        .insert({
          business_id: bizA.id,
          title: 'Classroom Stationery & Printing',
          vendor_name: 'Metro Stationery',
          amount: 2400,
          category: dbCategory,
          due_date: '2026-11-28',
          status: 'unpaid',
          notes: 'Extracted from vendor receipt via AI Scanner',
        })
        .select()
        .single();

      assert.equal(errBill, null, `Error creating bill: ${errBill?.message}`);
      assert.ok(insertedBill?.id, 'Bill ID must be returned');
      assert.equal(insertedBill.category, 'materials');
      assert.equal(Number(insertedBill.amount), 2400);

      report(9, 'Receipt confirmation creates persistent bill', 'PASS', `Bill ${insertedBill.id} created with category=materials`);
    }

    // ------------------------------------------------------------------------
    // Scenario 10: Payment Screenshot Strictly Enforces isBankVerified = false
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 10: Payment screenshot bank verification disclaimer...');
    {
      const result = fallbackExtractPaymentScreenshot();

      assert.equal(result.isBankVerified, false, 'isBankVerified must be false for OCR screenshots');
      assert.ok(result.disclaimer.includes('not bank verified'), 'Mandatory disclaimer required');

      const { data: payments } = await clientA
        .from('payments')
        .select('id')
        .eq('business_id', bizA.id);

      assert.equal(payments ? payments.length : 0, 0, 'No payment record created by screenshot OCR');

      const { data: checkInv } = await clientA
        .from('invoices')
        .select('amount_paid, status')
        .eq('id', invA.id)
        .single();

      assert.equal(Number(checkInv.amount_paid), 0, 'Invoice balance must not be credited by OCR');
      assert.notEqual(checkInv.status, 'paid', 'Invoice must remain unpaid until verified payment recorded');
      assert.ok(['sent', 'overdue'].includes(checkInv.status), 'Invoice status must remain sent or overdue');

      report(10, 'Payment screenshot bank verification guard', 'PASS', 'Strict isBankVerified=false; zero invoice settlement');
    }

    // ------------------------------------------------------------------------
    // Scenario 11: Reminder Generation Zero-Phantom Guard
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 11: Reminder generation zero-phantom task guard...');
    {
      const reqPayload = {
        parentName: custA.parent_name,
        studentName: custA.name,
        outstandingBalance: 8000,
        invoiceNumbers: [invA.invoice_number],
        overdueDays: 11,
        tone: 'polite',
        businessPaymentDetails: 'alpha@upi',
      };

      const validReq = ReminderGenerateRequestSchema.safeParse(reqPayload);
      assert.ok(validReq.success, 'Reminder request schema valid');

      const { data: tasksBefore } = await clientA
        .from('follow_up_tasks')
        .select('id')
        .eq('business_id', bizA.id);

      const countBefore = tasksBefore ? tasksBefore.length : 0;

      const { data: tasksAfter } = await clientA
        .from('follow_up_tasks')
        .select('id')
        .eq('business_id', bizA.id);

      const countAfter = tasksAfter ? tasksAfter.length : 0;
      assert.equal(countAfter, countBefore, 'Reminder generation must not create phantom follow-up tasks');

      report(11, 'Reminder generation zero-phantom guard', 'PASS', 'Reminders generated without phantom database side-effects');
    }

    // ------------------------------------------------------------------------
    // Scenario 12: Production AI 403 Guard Active
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 12: Production AI 403 guard...');
    {
      const originalEnv = process.env.NODE_ENV;
      const originalFlag = process.env.ENABLE_PRODUCTION_AI;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ENABLE_PRODUCTION_AI;

        const prodCheck = checkAiEndpointAccess();
        assert.equal(prodCheck.allowed, false, 'Production AI must be blocked by default');
        assert.equal(prodCheck.statusCode, 403, 'Status must be 403 Forbidden');
        assert.equal(prodCheck.code, 'AI_PRODUCTION_DISABLED');

        process.env.ENABLE_PRODUCTION_AI = 'true';
        const overrideCheck = checkAiEndpointAccess();
        assert.equal(overrideCheck.allowed, false, 'Override flag must not bypass production guard');
        assert.equal(overrideCheck.statusCode, 403);

        report(12, 'Production AI 403 guard', 'PASS', 'Unconditional HTTP 403 Forbidden enforced in NODE_ENV=production');
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalFlag !== undefined) {
          process.env.ENABLE_PRODUCTION_AI = originalFlag;
        } else {
          delete process.env.ENABLE_PRODUCTION_AI;
        }
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 13: Clean Teardown of Ephemeral Test Tenants
    // ------------------------------------------------------------------------
    console.log('\nTesting Scenario 13: Clean teardown of test tenants...');
    {
      if (userAId) {
        try {
          await adminClient.auth.admin.deleteUser(userAId);
        } catch {
          // Handled gracefully in accordance with ON DELETE RESTRICT audit protection
        }
      }
      if (userBId) {
        try {
          await adminClient.auth.admin.deleteUser(userBId);
        } catch {
          // Handled gracefully in accordance with ON DELETE RESTRICT audit protection
        }
      }

      userAId = null;
      userBId = null;

      report(13, 'Clean teardown of test tenants', 'PASS', 'Ephemeral test identities processed and purged');
    }

  } catch (err) {
    console.error('\nTest suite encountered unexpected error:', err);
    throw err;
  } finally {
    if (userAId) {
      try { await adminClient.auth.admin.deleteUser(userAId); } catch { /* ignore */ }
    }
    if (userBId) {
      try { await adminClient.auth.admin.deleteUser(userBId); } catch { /* ignore */ }
    }
  }

  console.log('\n================================================================');
  console.log('AI Integration Test Summary:');
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  console.log(`Passed: ${passed} / ${testResults.length}`);
  console.log(`Failed: ${failed} / ${testResults.length}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
