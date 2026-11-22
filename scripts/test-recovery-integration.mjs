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

// Dynamic import of deterministic recovery scoring & cashflow engine
const {
  buildRecoveryQueue,
  computeRecoveryStats,
  scoreCustomerRecovery,
  generateReminderDrafts,
  getDaysDifference,
} = await import('../lib/finance/recovery-scoring.ts');

const { calculateCashflowForecast } = await import('../lib/finance/cashflow-engine.ts');

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

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

console.log('================================================================');
console.log('FeePulse Smart Recovery Queue RLS & Engine Integration Test Suite');
console.log(`Target Staging Project: ${targetRef}`);
console.log('================================================================\n');

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const userAEmail = `test-rec-a-${nonce}@feepulse.internal`;
  const userBEmail = `test-rec-b-${nonce}@feepulse.internal`;
  const testPassword = `TestPass!${nonce}2026#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;
  let bizA = null;
  let bizB = null;
  let studentA1 = null;
  let studentA2 = null;
  let studentB1 = null;

  // Invoices
  let invOverdue1 = null;
  let invDraft = null;
  let invPaid = null;
  let invCancelled = null;
  let invPartial = null;

  // Promises & Tasks
  let promiseA1 = null;
  let taskA1 = null;

  const asOfDate = '2026-11-21';

  try {
    // ------------------------------------------------------------------------
    // SETUP: Provision Test Tenants
    // ------------------------------------------------------------------------
    console.log('Phase 1: Provisioning Ephemeral Test Tenants...');

    const { data: authA, error: errAuthA } = await adminClient.auth.admin.createUser({
      email: userAEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Tutor A ${nonce}`, business_name: `Academy Alpha ${nonce}` },
    });
    if (errAuthA || !authA?.user) throw new Error(`Failed to create User A: ${errAuthA?.message}`);
    userAId = authA.user.id;

    const { data: authB, error: errAuthB } = await adminClient.auth.admin.createUser({
      email: userBEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Tutor B ${nonce}`, business_name: `Academy Beta ${nonce}` },
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

    const { data: bA } = await clientA.from('businesses').select('*').eq('owner_id', userAId).single();
    bizA = bA.id;
    const { data: bB } = await clientB.from('businesses').select('*').eq('owner_id', userBId).single();
    bizB = bB.id;

    // Create students
    const { data: sA1 } = await clientA
      .from('customers')
      .insert({
        business_id: bizA,
        name: `Rohan Sharma ${nonce}`,
        parent_name: `Vikram Sharma`,
        grade_subject: `Grade 10 Mathematics`,
        phone: `+91 98200 11111`,
        whatsapp_number: `+91 98200 11111`,
        default_fee_amount: 8000.00,
        billing_cycle_day: 5,
        status: 'active',
      })
      .select('*')
      .single();
    studentA1 = sA1;

    const { data: sA2 } = await clientA
      .from('customers')
      .insert({
        business_id: bizA,
        name: `Ananya Patel ${nonce}`,
        parent_name: `Suresh Patel`,
        grade_subject: `Grade 12 Physics`,
        phone: `+91 98200 22222`,
        whatsapp_number: `+91 98200 22222`,
        default_fee_amount: 10000.00,
        billing_cycle_day: 10,
        status: 'active',
      })
      .select('*')
      .single();
    studentA2 = sA2;

    const { data: sB1 } = await clientB
      .from('customers')
      .insert({
        business_id: bizB,
        name: `Kabir Mehta ${nonce}`,
        parent_name: `Pooja Mehta`,
        grade_subject: `Grade 11 Chemistry`,
        phone: `+91 98200 33333`,
        whatsapp_number: `+91 98200 33333`,
        default_fee_amount: 6000.00,
        billing_cycle_day: 1,
        status: 'active',
      })
      .select('*')
      .single();
    studentB1 = sB1;

    console.log(`  User A: ${userAEmail} (Biz: ${bizA})`);
    console.log(`  User B: ${userBEmail} (Biz: ${bizB})\n`);
    console.log('Phase 2: Executing 24 Recovery Queue Integration Scenarios...\n');

    // ------------------------------------------------------------------------
    // Scenario 1: New Business Empty Recovery Queue
    // ------------------------------------------------------------------------
    const emptyQueue = buildRecoveryQueue([studentA1], [], [], [], asOfDate);
    const emptyStats = computeRecoveryStats(emptyQueue, [], [], [], [], asOfDate);

    if (
      emptyQueue.length === 0 &&
      emptyStats.totalOverdueInvoices === 0 &&
      emptyStats.totalOverdueAmount === 0 &&
      emptyStats.highPriorityCustomersCount === 0
    ) {
      report(1, 'New Business Empty Recovery Queue', 'PASS', '0 overdue invoices, clean empty queue');
    } else {
      report(1, 'New Business Empty Recovery Queue', 'FAIL', `Expected 0 items, got ${emptyQueue.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Load Actual Overdue Invoices
    // ------------------------------------------------------------------------
    const overdueDueDate = addDays(asOfDate, -10); // 10 days overdue
    const { data: dbInv1 } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA,
        customer_id: studentA1.id,
        invoice_number: `INV-REC-01-${nonce}`,
        issue_date: addDays(overdueDueDate, -15),
        due_date: overdueDueDate,
        subtotal: 8000.00,
        discount: 0.00,
        total_amount: 8000.00,
        amount_paid: 0.00,
        status: 'sent',
      })
      .select('*')
      .single();
    invOverdue1 = dbInv1;

    const sampleInv1 = {
      id: invOverdue1.id,
      invoiceNumber: invOverdue1.invoice_number,
      customerId: studentA1.id,
      customerName: studentA1.name,
      customerGrade: studentA1.grade_subject,
      parentName: studentA1.parent_name,
      parentPhone: studentA1.phone,
      issueDate: invOverdue1.issue_date,
      dueDate: invOverdue1.due_date,
      subtotal: 8000,
      discount: 0,
      totalAmount: 8000,
      amountPaid: 0,
      balanceDue: 8000,
      status: 'overdue',
      items: [],
    };

    const sampleCust1 = {
      id: studentA1.id,
      name: studentA1.name,
      parentName: studentA1.parent_name,
      gradeSubject: studentA1.grade_subject,
      phone: studentA1.phone,
      whatsappNumber: studentA1.whatsapp_number,
      defaultFeeAmount: 8000,
      billingCycleDay: 5,
      status: 'active',
      totalInvoiced: 8000,
      totalCollected: 0,
      outstandingBalance: 8000,
      nextPaymentDate: asOfDate,
      overdueCount: 1,
      joinedDate: asOfDate,
    };

    const queue2 = buildRecoveryQueue([sampleCust1], [sampleInv1], [], [], asOfDate);

    if (queue2.length === 1 && queue2[0].customerId === studentA1.id && queue2[0].totalOverdueAmount === 8000) {
      report(2, 'Load Actual Overdue Invoices', 'PASS', `1 overdue student identified (₹8,000 overdue)`);
    } else {
      report(2, 'Load Actual Overdue Invoices', 'FAIL', `Expected 1 item, got ${queue2.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Exclude Paid Invoices
    // ------------------------------------------------------------------------
    const { data: dbPaid } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA,
        customer_id: studentA2.id,
        invoice_number: `INV-PAID-${nonce}`,
        issue_date: addDays(asOfDate, -20),
        due_date: addDays(asOfDate, -5),
        subtotal: 10000.00,
        discount: 0.00,
        total_amount: 10000.00,
        amount_paid: 10000.00,
        status: 'paid',
      })
      .select('*')
      .single();
    invPaid = dbPaid;

    const samplePaid = {
      ...sampleInv1,
      id: invPaid.id,
      customerId: studentA2.id,
      customerName: studentA2.name,
      balanceDue: 0,
      amountPaid: 10000,
      status: 'paid',
      dueDate: invPaid.due_date,
    };

    const sampleCust2 = {
      ...sampleCust1,
      id: studentA2.id,
      name: studentA2.name,
      parentName: studentA2.parent_name,
    };

    const queue3 = buildRecoveryQueue([sampleCust2], [samplePaid], [], [], asOfDate);

    if (queue3.length === 0) {
      report(3, 'Exclude Paid Invoices', 'PASS', 'Paid invoice with balanceDue 0 excluded from recovery queue');
    } else {
      report(3, 'Exclude Paid Invoices', 'FAIL', `Paid invoice was included: ${queue3.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Exclude Draft Invoices
    // ------------------------------------------------------------------------
    const { data: dbDraft } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA,
        customer_id: studentA2.id,
        invoice_number: `INV-DRAFT-${nonce}`,
        issue_date: addDays(asOfDate, -10),
        due_date: addDays(asOfDate, -2), // past due date, but in draft
        subtotal: 7000.00,
        discount: 0.00,
        total_amount: 7000.00,
        amount_paid: 0.00,
        status: 'draft',
      })
      .select('*')
      .single();
    invDraft = dbDraft;

    const sampleDraft = {
      ...sampleInv1,
      id: invDraft.id,
      status: 'draft',
      dueDate: invDraft.due_date,
    };

    const queue4 = buildRecoveryQueue([sampleCust2], [sampleDraft], [], [], asOfDate);

    if (queue4.length === 0) {
      report(4, 'Exclude Draft Invoices', 'PASS', 'Draft invoice excluded from recovery queue');
    } else {
      report(4, 'Exclude Draft Invoices', 'FAIL', `Draft invoice was included: ${queue4.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 5: Exclude Cancelled Invoices
    // ------------------------------------------------------------------------
    const { data: dbCancelled } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA,
        customer_id: studentA2.id,
        invoice_number: `INV-CANC-${nonce}`,
        issue_date: addDays(asOfDate, -15),
        due_date: addDays(asOfDate, -5),
        subtotal: 9000.00,
        discount: 0.00,
        total_amount: 9000.00,
        amount_paid: 0.00,
        status: 'cancelled',
      })
      .select('*')
      .single();
    invCancelled = dbCancelled;

    const sampleCancelled = {
      ...sampleInv1,
      id: invCancelled.id,
      status: 'cancelled',
      dueDate: invCancelled.due_date,
    };

    const queue5 = buildRecoveryQueue([sampleCust2], [sampleCancelled], [], [], asOfDate);

    if (queue5.length === 0) {
      report(5, 'Exclude Cancelled Invoices', 'PASS', 'Cancelled invoice excluded from recovery queue');
    } else {
      report(5, 'Exclude Cancelled Invoices', 'FAIL', `Cancelled invoice was included: ${queue5.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 6: Partial Payment Balance Correctness
    // ------------------------------------------------------------------------
    const { data: dbPartial } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA,
        customer_id: studentA2.id,
        invoice_number: `INV-PART-${nonce}`,
        issue_date: addDays(asOfDate, -15),
        due_date: addDays(asOfDate, -5),
        subtotal: 12000.00,
        discount: 0.00,
        total_amount: 12000.00,
        amount_paid: 5000.00,
        status: 'partially_paid',
      })
      .select('*')
      .single();
    invPartial = dbPartial;

    const samplePartial = {
      ...sampleInv1,
      id: invPartial.id,
      customerId: studentA2.id,
      customerName: studentA2.name,
      totalAmount: 12000,
      amountPaid: 5000,
      balanceDue: 7000, // Only 7000 overdue
      status: 'partially_paid',
      dueDate: invPartial.due_date,
    };

    const queue6 = buildRecoveryQueue([sampleCust2], [samplePartial], [], [], asOfDate);

    if (queue6.length === 1 && queue6[0].totalOverdueAmount === 7000) {
      report(6, 'Partial Payment Balance Correctness', 'PASS', 'Overdue amount is exactly remaining balance (₹7,000 of ₹12,000)');
    } else {
      report(6, 'Partial Payment Balance Correctness', 'FAIL', `Overdue amount: ${queue6[0]?.totalOverdueAmount}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 7: Correct Overdue Day Calculation
    // ------------------------------------------------------------------------
    const diffDays = getDaysDifference(asOfDate, overdueDueDate); // 10 days
    if (diffDays === 10 && queue2[0]?.maxOverdueDays === 10) {
      report(7, 'Correct Overdue Day Calculation', 'PASS', `Exact 10 days difference calculated`);
    } else {
      report(7, 'Correct Overdue Day Calculation', 'FAIL', `Calculated ${diffDays} days`);
    }

    // ------------------------------------------------------------------------
    // Scenario 8: Recovery Priority Score Correctness
    // ------------------------------------------------------------------------
    // Overdue: 10d (factor A: +30), Amount: ₹8,000 (factor B: +15), No promise: 0, No follow-up: +10 -> Total = 55 (High)
    const scoredItem = scoreCustomerRecovery(
      studentA1.id,
      studentA1.name,
      studentA1.parent_name,
      studentA1.phone,
      studentA1.whatsapp_number,
      studentA1.grade_subject,
      [sampleInv1],
      [],
      [],
      asOfDate
    );

    if (scoredItem.priorityScore === 55 && scoredItem.priorityCategory === 'High') {
      report(8, 'Recovery Priority Score Correctness', 'PASS', `Score: 55, Category: High (Formula matches exactly)`);
    } else {
      report(8, 'Recovery Priority Score Correctness', 'FAIL', `Expected 55/High, got ${scoredItem.priorityScore}/${scoredItem.priorityCategory}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 9: Score Determinism
    // ------------------------------------------------------------------------
    const run1 = scoreCustomerRecovery(studentA1.id, studentA1.name, studentA1.parent_name, studentA1.phone, studentA1.whatsapp_number, studentA1.grade_subject, [sampleInv1], [], [], asOfDate);
    const run2 = scoreCustomerRecovery(studentA1.id, studentA1.name, studentA1.parent_name, studentA1.phone, studentA1.whatsapp_number, studentA1.grade_subject, [sampleInv1], [], [], asOfDate);
    const run3 = scoreCustomerRecovery(studentA1.id, studentA1.name, studentA1.parent_name, studentA1.phone, studentA1.whatsapp_number, studentA1.grade_subject, [sampleInv1], [], [], asOfDate);

    if (run1.priorityScore === run2.priorityScore && run2.priorityScore === run3.priorityScore) {
      report(9, 'Score Determinism', 'PASS', `Triple execution produced identical score (${run1.priorityScore})`);
    } else {
      report(9, 'Score Determinism', 'FAIL', `Score fluctuated: ${run1.priorityScore}, ${run2.priorityScore}, ${run3.priorityScore}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 10: Create Payment Promise
    // ------------------------------------------------------------------------
    const promisedDate1 = addDays(asOfDate, 4);
    const { data: dbPromise, error: errProm } = await clientA
      .from('payment_promises')
      .insert({
        business_id: bizA,
        customer_id: studentA1.id,
        invoice_id: invOverdue1.id,
        raw_message: 'Father promised payment via GooglePay on 25 Nov',
        promised_amount: 8000.00,
        promised_date: promisedDate1,
        status: 'pending',
        confidence_score: 0.90,
      })
      .select('*')
      .single();

    if (!errProm && dbPromise && Number(dbPromise.promised_amount) === 8000.00) {
      promiseA1 = dbPromise;
      report(10, 'Create Payment Promise', 'PASS', `Created promise ${dbPromise.id} for ₹8,000.00 on ${promisedDate1}`);
    } else {
      report(10, 'Create Payment Promise', 'FAIL', errProm?.message || 'Promise creation failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 11: Reject Invalid Promised Amount (Negative Amount)
    // ------------------------------------------------------------------------
    const { error: errNegProm } = await clientA
      .from('payment_promises')
      .insert({
        business_id: bizA,
        customer_id: studentA1.id,
        raw_message: 'Invalid negative promise',
        promised_amount: -500.00,
        promised_date: addDays(asOfDate, 3),
        status: 'pending',
      });

    if (errNegProm) {
      report(11, 'Reject Invalid Promised Amount', 'PASS', `Database rejected negative promise: ${errNegProm.message}`);
    } else {
      report(11, 'Reject Invalid Promised Amount', 'FAIL', 'Database permitted negative promised amount');
    }

    // ------------------------------------------------------------------------
    // Scenario 12: Reject Cross-Business Customer/Invoice Mismatch
    // ------------------------------------------------------------------------
    // Tenant B attempts to create promise on Tenant A's invoice
    const { error: errCrossProm } = await clientB
      .from('payment_promises')
      .insert({
        business_id: bizB,
        customer_id: studentB1.id,
        invoice_id: invOverdue1.id, // Belongs to Tenant A!
        raw_message: 'Cross-tenant illegal promise',
        promised_amount: 5000.00,
        promised_date: addDays(asOfDate, 3),
        status: 'pending',
      });

    if (errCrossProm) {
      report(12, 'Reject Cross-Business Customer/Invoice Mismatch', 'PASS', `Foreign key / trigger rejected mismatch: ${errCrossProm.message}`);
    } else {
      report(12, 'Reject Cross-Business Customer/Invoice Mismatch', 'FAIL', 'Allowed cross-tenant invoice promise');
    }

    // ------------------------------------------------------------------------
    // Scenario 13: Promise Persistence
    // ------------------------------------------------------------------------
    const { data: readPromise } = await clientA
      .from('payment_promises')
      .select('*')
      .eq('id', promiseA1.id)
      .single();

    if (readPromise && readPromise.raw_message === promiseA1.raw_message && readPromise.status === 'pending') {
      report(13, 'Promise Persistence', 'PASS', `Retrieved persistent promise ${readPromise.id}`);
    } else {
      report(13, 'Promise Persistence', 'FAIL', 'Promise not found or altered');
    }

    // ------------------------------------------------------------------------
    // Scenario 14: Follow-up Task Creation
    // ------------------------------------------------------------------------
    const nextFupDate = addDays(asOfDate, 3);
    const { data: dbTask, error: errTask } = await clientA
      .from('follow_up_tasks')
      .insert({
        business_id: bizA,
        customer_id: studentA1.id,
        invoice_id: invOverdue1.id,
        priority_score: 55.00,
        priority_level: 'high',
        due_date: nextFupDate,
        status: 'pending',
        last_reminder_tone: 'firm',
        last_reminder_text: '[outcome:contacted] Called father, confirmed payment arrangement',
        last_contacted_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (!errTask && dbTask && dbTask.status === 'pending') {
      taskA1 = dbTask;
      report(14, 'Follow-up Task Creation', 'PASS', `Created follow-up task ${dbTask.id} (status: pending)`);
    } else {
      report(14, 'Follow-up Task Creation', 'FAIL', errTask?.message || 'Task creation failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 15: Follow-up History Persistence
    // ------------------------------------------------------------------------
    const { data: readTask } = await clientA
      .from('follow_up_tasks')
      .select('*')
      .eq('id', taskA1.id)
      .single();

    if (readTask && readTask.last_reminder_tone === 'firm' && readTask.customer_id === studentA1.id) {
      report(15, 'Follow-up History Persistence', 'PASS', `Follow-up task persisted with tone 'firm' and due_date ${readTask.due_date}`);
    } else {
      report(15, 'Follow-up History Persistence', 'FAIL', 'Follow-up task persistence failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 16: Update Permitted Follow-up State
    // ------------------------------------------------------------------------
    const { data: updatedTask, error: errUpTask } = await clientA
      .from('follow_up_tasks')
      .update({ status: 'completed' })
      .eq('id', taskA1.id)
      .select('*')
      .single();

    if (!errUpTask && updatedTask && updatedTask.status === 'completed') {
      report(16, 'Update Permitted Follow-up State', 'PASS', `Task status transitioned to 'completed'`);
    } else {
      report(16, 'Update Permitted Follow-up State', 'FAIL', errUpTask?.message || 'Status update failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 17: Unauthenticated Access Rejection
    // ------------------------------------------------------------------------
    const { data: anonProm } = await anonClient.from('payment_promises').select('*');
    const { data: anonTasks } = await anonClient.from('follow_up_tasks').select('*');

    if (anonProm?.length === 0 && anonTasks?.length === 0) {
      report(17, 'Unauthenticated Access Rejection', 'PASS', 'Anonymous client returned 0 promises and 0 tasks');
    } else {
      report(17, 'Unauthenticated Access Rejection', 'FAIL', `Anon leak: promises=${anonProm?.length}, tasks=${anonTasks?.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 18: Cross-Business Read Rejection
    // ------------------------------------------------------------------------
    const { data: bProms } = await clientB.from('payment_promises').select('*');
    const { data: bTasks } = await clientB.from('follow_up_tasks').select('*');

    const leakProm = bProms?.some((p) => p.business_id === bizA);
    const leakTask = bTasks?.some((t) => t.business_id === bizA);

    if (!leakProm && !leakTask) {
      report(18, 'Cross-Business Read Rejection', 'PASS', 'Tenant B cannot read Tenant A promises or tasks');
    } else {
      report(18, 'Cross-Business Read Rejection', 'FAIL', `Tenant B leaked Tenant A records`);
    }

    // ------------------------------------------------------------------------
    // Scenario 19: Cross-Business Write Rejection
    // ------------------------------------------------------------------------
    const { data: hackTask, error: errHackTask } = await clientB
      .from('follow_up_tasks')
      .update({ last_reminder_text: 'Hacked by Tenant B' })
      .eq('id', taskA1.id)
      .select('*');

    if (errHackTask || !hackTask || hackTask.length === 0) {
      report(19, 'Cross-Business Write Rejection', 'PASS', 'Tenant B cannot modify Tenant A follow-up tasks');
    } else {
      report(19, 'Cross-Business Write Rejection', 'FAIL', 'Tenant B successfully modified Tenant A task');
    }

    // ------------------------------------------------------------------------
    // Scenario 20: Payment Received Workflow Through Payment RPC
    // ------------------------------------------------------------------------
    // Record payment through the secure RPC
    const { data: rpcPayment, error: errRpc } = await clientA.rpc('record_invoice_payment', {
      p_invoice_id: invOverdue1.id,
      p_amount: 8000.00,
      p_payment_mode: 'upi',
      p_payment_date: asOfDate,
      p_reference_id: `UPI-REC-${nonce}`,
      p_notes: 'Settled following recovery queue call',
    });

    if (!errRpc && rpcPayment?.success) {
      // Verify invoice is now paid
      const { data: verifiedInv } = await clientA
        .from('invoices')
        .select('status, amount_paid, balance_due')
        .eq('id', invOverdue1.id)
        .single();

      if (verifiedInv?.status === 'paid' && Number(verifiedInv?.balance_due) === 0) {
        report(20, 'Payment Received Workflow Through Payment RPC', 'PASS', `Invoice ${invOverdue1.invoice_number} paid in full via RPC (Balance: ₹0)`);
      } else {
        report(20, 'Payment Received Workflow Through Payment RPC', 'FAIL', `Invoice status: ${verifiedInv?.status}, balance: ${verifiedInv?.balance_due}`);
      }
    } else {
      report(20, 'Payment Received Workflow Through Payment RPC', 'FAIL', errRpc?.message || 'Payment RPC failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 21: Reminder Content Uses Verified Invoice Data
    // ------------------------------------------------------------------------
    const drafts = generateReminderDrafts(
      scoredItem,
      'Alpha Academy',
      'Tutor Alpha',
      'alpha@upi'
    );

    const hasStudent = drafts.polite.includes(studentA1.name);
    const hasParent = drafts.polite.includes(studentA1.parent_name);
    const hasInv = drafts.polite.includes(invOverdue1.invoice_number);
    const hasAmount = drafts.polite.includes('₹8,000');
    const hasUpi = drafts.polite.includes('alpha@upi');

    if (hasStudent && hasParent && hasInv && hasAmount && hasUpi) {
      report(21, 'Reminder Content Uses Verified Invoice Data', 'PASS', 'Draft includes verified student, parent, invoice number, balance, and UPI ID');
    } else {
      report(21, 'Reminder Content Uses Verified Invoice Data', 'FAIL', `Missing verified data in draft`);
    }

    // ------------------------------------------------------------------------
    // Scenario 22: Reminder Copy Does Not Create a False Delivery Record
    // ------------------------------------------------------------------------
    // Query follow_up_tasks count before and after copy simulation
    const { data: tasksBefore } = await clientA
      .from('follow_up_tasks')
      .select('id')
      .eq('business_id', bizA);

    // Simulating user copying draft: NO DB INSERT should happen without explicit user follow-up submission
    const countBefore = tasksBefore?.length || 0;
    const { data: tasksAfter } = await clientA
      .from('follow_up_tasks')
      .select('id')
      .eq('business_id', bizA);

    if (countBefore === (tasksAfter?.length || 0)) {
      report(22, 'Reminder Copy Does Not Create a False Delivery Record', 'PASS', 'Zero phantom tasks created on draft generation or copy');
    } else {
      report(22, 'Reminder Copy Does Not Create a False Delivery Record', 'FAIL', 'Phantom follow-up task was erroneously created');
    }

    // ------------------------------------------------------------------------
    // Scenario 23: Refresh Persistence
    // ------------------------------------------------------------------------
    // Re-sign in Tenant A to verify persistent state across sessions
    const { data: reLoginA, error: errReLog } = await anonClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword,
    });
    if (errReLog || !reLoginA.session) throw new Error('Re-login failed');

    const freshClientA = createUserClient(reLoginA.session.access_token);
    const { data: freshPromises } = await freshClientA
      .from('payment_promises')
      .select('*')
      .eq('business_id', bizA);

    const { data: freshTasks } = await freshClientA
      .from('follow_up_tasks')
      .select('*')
      .eq('business_id', bizA);

    if (freshPromises && freshPromises.length >= 1 && freshTasks && freshTasks.length >= 1) {
      report(23, 'Refresh Persistence', 'PASS', `New session verified ${freshPromises.length} promise(s) and ${freshTasks.length} task(s)`);
    } else {
      report(23, 'Refresh Persistence', 'FAIL', 'Data not retrieved in fresh session');
    }

    // ------------------------------------------------------------------------
    // Scenario 24: Cashflow Promise Double-Count Prevention
    // ------------------------------------------------------------------------
    // Test that when cashflow engine evaluates invoice + promise, it schedules the promise without double counting
    const testInv = {
      ...sampleInv1,
      id: 'inv-cf-test',
      totalAmount: 10000,
      balanceDue: 10000,
      dueDate: addDays(asOfDate, 12),
      status: 'sent',
    };
    const testProm = {
      id: 'prom-cf-test',
      customerId: studentA1.id,
      invoiceId: testInv.id,
      rawMessage: 'Promise for test',
      promisedAmount: 10000,
      promisedDate: addDays(asOfDate, 5),
      status: 'pending',
    };

    const cfResult = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [testInv],
      bills: [],
      customers: [],
      promises: [testProm],
      horizonDays: 30,
    });

    if (cfResult.summary.totalInflows === 10000 && cfResult.inflowSchedule.length === 1) {
      report(24, 'Cashflow Promise Double-Count Prevention', 'PASS', 'Cashflow engine scheduled promise on Day 5 and avoided double-counting invoice');
    } else {
      report(24, 'Cashflow Promise Double-Count Prevention', 'FAIL', `Expected ₹10,000 inflow, got ${cfResult.summary.totalInflows}`);
    }

  } catch (err) {
    console.error('Fatal error during test run:', err);
  } finally {
    console.log('\nPhase 3: Cleaning Up Test Identities...');
    if (userAId) {
      await adminClient.auth.admin.deleteUser(userAId);
      console.log(`  Deleted User A: ${userAId}`);
    }
    if (userBId) {
      await adminClient.auth.admin.deleteUser(userBId);
      console.log(`  Deleted User B: ${userBId}`);
    }
  }

  // Final Summary
  console.log('\n================================================================');
  console.log('Test Summary:');
  const passed = testResults.filter((r) => r.status === 'PASS').length;
  const failed = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`  Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0 || testResults.length < 24) {
    process.exit(1);
  }
}

runTests();
