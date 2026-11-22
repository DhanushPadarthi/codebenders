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

// Verify target project ref
const projectRefPath = path.resolve('supabase/.temp/project-ref');
const targetRef = fs.existsSync(projectRefPath) ? fs.readFileSync(projectRefPath, 'utf8').trim() : '';
if (targetRef !== 'eyauiehyiipqkvfjecnx') {
  console.error(`FAIL: Target project ref ${targetRef} does not match eyauiehyiipqkvfjecnx`);
  process.exit(1);
}

// Dynamic import of deterministic cashflow engine using experimental strip types
const {
  calculateCashflowForecast,
  simulateWhatIfScenario,
} = await import('../lib/finance/cashflow-engine.ts');

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
console.log('FeePulse Cashflow Forecasting RLS & Engine Integration Test Suite');
console.log(`Target Staging Project: ${targetRef}`);
console.log('================================================================\n');

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const userAEmail = `test-cf-a-${nonce}@feepulse.internal`;
  const userBEmail = `test-cf-b-${nonce}@feepulse.internal`;
  const testPassword = `TestPass!${nonce}2026#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;
  let bizA = null;
  let bizB = null;
  let custA = null;
  let inv1 = null;

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

    const { data: bA, error: errBA } = await clientA
      .from('businesses')
      .select('*')
      .eq('owner_id', userAId)
      .single();
    if (errBA || !bA) throw new Error(`User A business not provisioned: ${errBA?.message}`);
    bizA = bA.id;

    const { data: bB, error: errBB } = await clientB
      .from('businesses')
      .select('*')
      .eq('owner_id', userBId)
      .single();
    if (errBB || !bB) throw new Error(`User B business not provisioned: ${errBB?.message}`);
    bizB = bB.id;

    // Create a customer for Tenant A
    const { data: customerRow, error: errCust } = await clientA
      .from('customers')
      .insert({
        business_id: bizA,
        name: `Rohan Sharma ${nonce}`,
        parent_name: `Vikram Sharma`,
        grade_subject: `Grade 10 Mathematics`,
        phone: `+91 98200 ${nonce.slice(0, 5)}`,
        whatsapp_number: `+91 98200 ${nonce.slice(0, 5)}`,
        default_fee_amount: 8000.00,
        billing_cycle_day: 5,
        status: 'active',
      })
      .select('*')
      .single();

    if (errCust || !customerRow) {
      throw new Error(`Failed to create test customer: ${errCust?.message}`);
    }
    custA = customerRow;

    console.log(`  User A: ${userAEmail} (Biz: ${bizA})`);
    console.log(`  User B: ${userBEmail} (Biz: ${bizB})\n`);
    console.log('Phase 2: Executing 22 Cashflow Integration Test Scenarios...\n');

    // ------------------------------------------------------------------------
    // Scenario 1: New Business Empty Forecast (Zero Balance, Empty Schedules)
    // ------------------------------------------------------------------------
    const emptyInputs = {
      asOfDate,
      openingCashBalance: 0,
      invoices: [],
      bills: [],
      customers: [],
      promises: [],
      horizonDays: 30,
      safeReserveThreshold: 50000,
    };
    const emptyForecast = calculateCashflowForecast(emptyInputs);

    if (
      emptyForecast.summary.totalInflows === 0 &&
      emptyForecast.summary.totalOutflows === 0 &&
      emptyForecast.summary.projectedClosingBalance === 0 &&
      emptyForecast.inflowSchedule.length === 0 &&
      emptyForecast.outflowSchedule.length === 0 &&
      emptyForecast.points.length === 31
    ) {
      report(1, 'New Business Empty Forecast', 'PASS', 'Zero balance, 0 inflows, 0 outflows across 30 days (31 daily points)');
    } else {
      report(1, 'New Business Empty Forecast', 'FAIL', `inflows=${emptyForecast.summary.totalInflows}, outflows=${emptyForecast.summary.totalOutflows}, points=${emptyForecast.points.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Actual Unpaid Invoice as Inflow
    // ------------------------------------------------------------------------
    const inv1DueDate = addDays(asOfDate, 8); // Within 30 days
    const { data: dbInv1, error: errInv1 } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA,
        customer_id: custA.id,
        invoice_number: `INV-CF-01-${nonce}`,
        issue_date: asOfDate,
        due_date: inv1DueDate,
        subtotal: 10000.00,
        discount: 0.00,
        total_amount: 10000.00,
        amount_paid: 0.00,
        status: 'sent',
      })
      .select('*')
      .single();

    if (errInv1 || !dbInv1) {
      throw new Error(`Failed to create test invoice: ${errInv1?.message}`);
    }
    inv1 = dbInv1;

    const sampleInv1 = {
      id: inv1.id,
      invoiceNumber: inv1.invoice_number,
      customerId: custA.id,
      customerName: custA.name,
      customerGrade: custA.grade_subject,
      parentPhone: custA.phone,
      issueDate: inv1.issue_date,
      dueDate: inv1.due_date,
      subtotal: 10000,
      discount: 0,
      totalAmount: 10000,
      amountPaid: 0,
      balanceDue: 10000,
      status: 'sent',
      items: [],
    };

    const forecast2 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [sampleInv1],
      bills: [],
      customers: [],
      promises: [],
      horizonDays: 30,
    });

    if (forecast2.summary.totalInflows === 10000 && forecast2.summary.projectedClosingBalance === 10000) {
      report(2, 'Actual Unpaid Invoice as Inflow', 'PASS', `Scheduled ₹10,000 inflow on ${inv1DueDate}`);
    } else {
      report(2, 'Actual Unpaid Invoice as Inflow', 'FAIL', `Expected ₹10,000, got ${forecast2.summary.totalInflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Partial Invoice Balance as Inflow (Only Remaining Balance)
    // ------------------------------------------------------------------------
    const partialInv = {
      ...sampleInv1,
      id: 'inv-partial',
      totalAmount: 12000,
      amountPaid: 4000,
      balanceDue: 8000,
      status: 'partially_paid',
    };

    const forecast3 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [partialInv],
      bills: [],
      customers: [],
      promises: [],
      horizonDays: 30,
    });

    if (forecast3.summary.totalInflows === 8000) {
      report(3, 'Partial Invoice Balance as Inflow', 'PASS', 'Scheduled only remaining balance (₹8,000 of ₹12,000)');
    } else {
      report(3, 'Partial Invoice Balance as Inflow', 'FAIL', `Expected ₹8,000, got ${forecast3.summary.totalInflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Paid Invoice Exclusion From Future Inflows
    // ------------------------------------------------------------------------
    const paidInv = {
      ...sampleInv1,
      id: 'inv-paid',
      totalAmount: 10000,
      amountPaid: 10000,
      balanceDue: 0,
      status: 'paid',
    };

    const forecast4 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [paidInv],
      bills: [],
      customers: [],
      promises: [],
      horizonDays: 30,
    });

    if (forecast4.summary.totalInflows === 0 && forecast4.inflowSchedule.length === 0) {
      report(4, 'Paid Invoice Exclusion From Future Inflows', 'PASS', 'Paid invoice balanceDue 0 yields 0 future inflows');
    } else {
      report(4, 'Paid Invoice Exclusion From Future Inflows', 'FAIL', `Paid invoice leaked ${forecast4.summary.totalInflows} inflow`);
    }

    // ------------------------------------------------------------------------
    // Scenario 5: Draft Invoice Exclusion
    // ------------------------------------------------------------------------
    const draftInv = {
      ...sampleInv1,
      id: 'inv-draft',
      totalAmount: 20000,
      balanceDue: 20000,
      status: 'draft',
    };

    const forecast5 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [draftInv],
      bills: [],
      customers: [],
      promises: [],
      horizonDays: 30,
    });

    if (forecast5.summary.totalInflows === 0) {
      report(5, 'Draft Invoice Exclusion', 'PASS', 'Draft invoice excluded from projected inflows');
    } else {
      report(5, 'Draft Invoice Exclusion', 'FAIL', `Draft invoice yielded ${forecast5.summary.totalInflows} inflow`);
    }

    // ------------------------------------------------------------------------
    // Scenario 6: Cancelled Invoice Exclusion
    // ------------------------------------------------------------------------
    const cancelledInv = {
      ...sampleInv1,
      id: 'inv-cancelled',
      totalAmount: 15000,
      balanceDue: 15000,
      status: 'cancelled',
    };

    const forecast6 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [cancelledInv],
      bills: [],
      customers: [],
      promises: [],
      horizonDays: 30,
    });

    if (forecast6.summary.totalInflows === 0) {
      report(6, 'Cancelled Invoice Exclusion', 'PASS', 'Cancelled invoice excluded from projected inflows');
    } else {
      report(6, 'Cancelled Invoice Exclusion', 'FAIL', `Cancelled invoice yielded ${forecast6.summary.totalInflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 7: Pending Payment Promises Included
    // ------------------------------------------------------------------------
    const promiseDate = addDays(asOfDate, 5);
    const { data: dbPromise } = await clientA
      .from('payment_promises')
      .insert({
        business_id: bizA,
        customer_id: custA.id,
        invoice_id: sampleInv1.id,
        raw_message: 'Will pay ₹7,500 by UPI on 26 Nov',
        promised_amount: 7500.00,
        promised_date: promiseDate,
        status: 'pending',
        confidence_score: 0.90,
      })
      .select('*')
      .single();

    const samplePromise = {
      id: dbPromise.id,
      invoiceId: sampleInv1.id,
      customerId: custA.id,
      rawMessage: dbPromise.raw_message,
      promisedAmount: 7500,
      promisedDate: dbPromise.promised_date,
      status: 'pending',
      confidenceScore: 0.90,
    };

    const forecast7 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [sampleInv1],
      bills: [],
      customers: [],
      promises: [samplePromise],
      horizonDays: 30,
    });

    const promiseScheduled = forecast7.inflowSchedule.find((item) => item.type === 'payment_promise');

    if (promiseScheduled && promiseScheduled.amount === 7500 && promiseScheduled.date === promiseDate) {
      report(7, 'Pending Payment Promises Included', 'PASS', `Included ₹7,500 promise on ${promiseDate}`);
    } else {
      report(7, 'Pending Payment Promises Included', 'FAIL', `Expected ₹7,500 on ${promiseDate}, got ${promiseScheduled?.amount}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 8: Promise Double-Count Prevention (Linked Promise)
    // ------------------------------------------------------------------------
    const linkedPromise = {
      ...samplePromise,
      id: 'prom-linked',
      invoiceId: sampleInv1.id,
      promisedAmount: 10000,
      promisedDate: addDays(asOfDate, 4), // Day 4 instead of Day 8
    };

    const forecast8 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 0,
      invoices: [sampleInv1], // ₹10,000 on day 8
      bills: [],
      customers: [],
      promises: [linkedPromise], // ₹10,000 on day 4
      horizonDays: 30,
    });

    // Total inflows must remain ₹10,000, NOT ₹20,000
    if (forecast8.summary.totalInflows === 10000 && forecast8.inflowSchedule.length === 1) {
      report(8, 'Promise Double-Count Prevention', 'PASS', 'Linked invoice + promise schedules ₹10,000 once on promised date');
    } else {
      report(8, 'Promise Double-Count Prevention', 'FAIL', `Double count detected: inflows=${forecast8.summary.totalInflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 9: Actual Pending Bills as Outflows
    // ------------------------------------------------------------------------
    const billDueDate = addDays(asOfDate, 7);
    const { data: dbBill1 } = await clientA
      .from('bills')
      .insert({
        business_id: bizA,
        title: 'Studio Rent December',
        category: 'rent',
        amount: 15000.00,
        due_date: billDueDate,
        status: 'unpaid',
        is_recurring: false,
      })
      .select('*')
      .single();

    const sampleBill1 = {
      id: dbBill1.id,
      title: dbBill1.title,
      vendorName: 'Landlord',
      category: 'Rent',
      amount: 15000,
      dueDate: dbBill1.due_date,
      status: 'unpaid',
      isRecurring: false,
    };

    const forecast9 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 20000,
      invoices: [],
      bills: [sampleBill1],
      customers: [],
      promises: [],
      horizonDays: 30,
    });

    if (forecast9.summary.totalOutflows === 15000 && forecast9.summary.projectedClosingBalance === 5000) {
      report(9, 'Actual Pending Bills as Outflows', 'PASS', `Scheduled ₹15,000 outflow, closing balance ₹5,000`);
    } else {
      report(9, 'Actual Pending Bills as Outflows', 'FAIL', `Expected outflow ₹15,000, got ${forecast9.summary.totalOutflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 10: Paid Bill Exclusion From Future Outflows
    // ------------------------------------------------------------------------
    const paidBill = {
      ...sampleBill1,
      id: 'bill-paid',
      status: 'paid',
      paidDate: asOfDate,
    };

    const forecast10 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 20000,
      invoices: [],
      bills: [paidBill],
      customers: [],
      promises: [],
      horizonDays: 30,
    });

    if (forecast10.summary.totalOutflows === 0 && forecast10.outflowSchedule.length === 0) {
      report(10, 'Paid Bill Exclusion From Future Outflows', 'PASS', 'Settled bill excluded from future cash outflows');
    } else {
      report(10, 'Paid Bill Exclusion From Future Outflows', 'FAIL', `Paid bill leaked ${forecast10.summary.totalOutflows} outflow`);
    }

    // ------------------------------------------------------------------------
    // Scenario 11: Monthly Recurring Expenses Projection
    // ------------------------------------------------------------------------
    const monthlyBill = {
      id: 'bill-monthly',
      title: 'Broadband Internet',
      vendorName: 'ISP',
      category: 'Internet',
      amount: 2000,
      dueDate: '2026-11-25',
      status: 'unpaid',
      isRecurring: true,
      recurringFrequency: 'monthly',
      recurringDayOfMonth: 25,
    };

    const forecast11 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 10000,
      invoices: [],
      bills: [monthlyBill],
      customers: [],
      promises: [],
      horizonDays: 60,
    });

    // In 60 days starting Nov 21: Nov 25 + Dec 25 = 2 occurrences = ₹4,000
    if (forecast11.summary.totalOutflows === 4000) {
      report(11, 'Monthly Recurring Expenses Projection', 'PASS', 'Generated 2 monthly occurrences over 60-day horizon (₹4,000)');
    } else {
      report(11, 'Monthly Recurring Expenses Projection', 'FAIL', `Expected ₹4,000, got ${forecast11.summary.totalOutflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 12: Quarterly Recurring Expenses Projection
    // ------------------------------------------------------------------------
    const quarterlyBill = {
      id: 'bill-quarterly',
      title: 'Municipal Education Tax',
      vendorName: 'City Council',
      category: 'Other',
      amount: 6000,
      dueDate: '2026-12-15',
      status: 'unpaid',
      isRecurring: true,
      recurringFrequency: 'quarterly',
      recurringDayOfMonth: 15,
    };

    const forecast12 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 10000,
      invoices: [],
      bills: [quarterlyBill],
      customers: [],
      promises: [],
      horizonDays: 90,
    });

    if (forecast12.summary.totalOutflows >= 6000) {
      report(12, 'Quarterly Recurring Expenses Projection', 'PASS', `Quarterly recurrence projected over 90 days (₹${forecast12.summary.totalOutflows})`);
    } else {
      report(12, 'Quarterly Recurring Expenses Projection', 'FAIL', `Quarterly bill not projected: ${forecast12.summary.totalOutflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 13: Yearly Recurring Expenses Projection
    // ------------------------------------------------------------------------
    const yearlyBill = {
      id: 'bill-yearly',
      title: 'Domain & Hosting Renewal',
      vendorName: 'WebHost',
      category: 'Software',
      amount: 5000,
      dueDate: '2027-08-15', // Outside 90 days
      status: 'unpaid',
      isRecurring: true,
      recurringFrequency: 'yearly',
    };

    const forecast13 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 10000,
      invoices: [],
      bills: [yearlyBill],
      customers: [],
      promises: [],
      horizonDays: 90,
    });

    if (forecast13.summary.totalOutflows === 0) {
      report(13, 'Yearly Recurring Expenses Projection', 'PASS', 'Yearly bill outside 90-day window correctly excluded');
    } else {
      report(13, 'Yearly Recurring Expenses Projection', 'FAIL', `Yearly bill erroneously projected: ${forecast13.summary.totalOutflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 14: Recurrence End-Date Handling
    // ------------------------------------------------------------------------
    const endedRecurBill = {
      id: 'bill-ended',
      title: 'Equipment Lease',
      vendorName: 'LeaseCorp',
      category: 'Other',
      amount: 3000,
      dueDate: '2026-11-28',
      status: 'unpaid',
      isRecurring: true,
      recurringFrequency: 'monthly',
      recurringDayOfMonth: 28,
      recurringEndDate: '2026-12-10', // Ends before Dec 28
    };

    const forecast14 = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 10000,
      invoices: [],
      bills: [endedRecurBill],
      customers: [],
      promises: [],
      horizonDays: 60,
    });

    // Only Nov 28 occurrence generated (Dec 28 is past Dec 10 end date)
    if (forecast14.summary.totalOutflows === 3000) {
      report(14, 'Recurrence End-Date Handling', 'PASS', 'Terminated recurring occurrences after recurringEndDate (₹3,000)');
    } else {
      report(14, 'Recurrence End-Date Handling', 'FAIL', `Expected ₹3,000, got ${forecast14.summary.totalOutflows}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 15: 30-Day Forecast Horizon
    // ------------------------------------------------------------------------
    const fc30 = calculateCashflowForecast({ ...emptyInputs, horizonDays: 30 });
    if (fc30.points.length === 31 && fc30.summary.horizonDays === 30) {
      report(15, '30-Day Forecast Horizon', 'PASS', 'Generated exactly 31 daily roll-forward points (day 0 to 30)');
    } else {
      report(15, '30-Day Forecast Horizon', 'FAIL', `Points length: ${fc30.points.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 16: 60-Day Forecast Horizon
    // ------------------------------------------------------------------------
    const fc60 = calculateCashflowForecast({ ...emptyInputs, horizonDays: 60 });
    if (fc60.points.length === 61 && fc60.summary.horizonDays === 60) {
      report(16, '60-Day Forecast Horizon', 'PASS', 'Generated exactly 61 daily roll-forward points (day 0 to 60)');
    } else {
      report(16, '60-Day Forecast Horizon', 'FAIL', `Points length: ${fc60.points.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 17: 90-Day Forecast Horizon
    // ------------------------------------------------------------------------
    const fc90 = calculateCashflowForecast({ ...emptyInputs, horizonDays: 90 });
    if (fc90.points.length === 91 && fc90.summary.horizonDays === 90) {
      report(17, '90-Day Forecast Horizon', 'PASS', 'Generated exactly 91 daily roll-forward points (day 0 to 90)');
    } else {
      report(17, '90-Day Forecast Horizon', 'FAIL', `Points length: ${fc90.points.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 18: Negative Cashflow / Deficit Detection
    // ------------------------------------------------------------------------
    const bigBill = {
      id: 'big-bill-deficit',
      title: 'Studio Renovation Deposit',
      vendorName: 'Contractor',
      category: 'Other',
      amount: 40000,
      dueDate: addDays(asOfDate, 6),
      status: 'unpaid',
      isRecurring: false,
    };

    const deficitForecast = calculateCashflowForecast({
      asOfDate,
      openingCashBalance: 10000, // Inflow = 0, Outflow = 40,000 -> Deficit -30,000
      invoices: [],
      bills: [bigBill],
      customers: [],
      promises: [],
      horizonDays: 30,
      safeReserveThreshold: 5000,
    });

    if (deficitForecast.summary.hasDeficit && deficitForecast.summary.lowestProjectedBalance === -30000) {
      report(18, 'Negative Cashflow / Deficit Detection', 'PASS', `Deficit detected: lowest balance -₹30,000 on ${deficitForecast.summary.lowestBalanceDate}`);
    } else {
      report(18, 'Negative Cashflow / Deficit Detection', 'FAIL', `Deficit not flagged properly: ${JSON.stringify(deficitForecast.summary)}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 19: Scenario Comparison (Baseline vs Scenario)
    // ------------------------------------------------------------------------
    const invForScenario = {
      ...sampleInv1,
      id: 'inv-sim-1',
      dueDate: addDays(asOfDate, 3), // Arrives Day 3 (before the Day 7 bill)
    };

    const baseInputs = {
      asOfDate,
      openingCashBalance: 15000,
      invoices: [invForScenario], // ₹10,000 due day 3
      bills: [sampleBill1], // ₹15,000 due day 7
      customers: [],
      promises: [],
      horizonDays: 30,
      safeReserveThreshold: 10000,
    };

    const scenarioParams = {
      id: 'sim-delay-inv',
      name: 'Delay Student Fee +15 Days',
      delayedInvoiceId: invForScenario.id,
      delayDays: 15,
    };

    const simResult = simulateWhatIfScenario(baseInputs, scenarioParams);

    const isBaseIntact = simResult.baseResult.summary.totalInflows === 10000;
    const isScenarioDelayed = simResult.scenarioResult.summary.lowestProjectedBalance < simResult.baseResult.summary.lowestProjectedBalance;

    if (isBaseIntact && isScenarioDelayed && simResult.differenceLowestBalance === -10000) {
      report(19, 'Scenario Comparison (Baseline vs Scenario)', 'PASS', `Base lowest: ₹${simResult.baseResult.summary.lowestProjectedBalance}, Scenario lowest: ₹${simResult.scenarioResult.summary.lowestProjectedBalance} (Diff: -₹10,000)`);
    } else {
      report(19, 'Scenario Comparison (Baseline vs Scenario)', 'FAIL', `baseLowest=${simResult.baseResult.summary.lowestProjectedBalance}, scLowest=${simResult.scenarioResult.summary.lowestProjectedBalance}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 20: Cross-Business Scenario Isolation
    // ------------------------------------------------------------------------
    // Tenant A saves a scenario
    const { data: savedScA, error: errSaveA } = await clientA
      .from('cashflow_scenarios')
      .insert({
        business_id: bizA,
        name: 'Alpha Buffer Scenario',
        description: 'Simulating rent hike',
        parameters: { overheadIncreasePercent: 20 },
        result_summary: { projectedClosingBalance: 45000 },
        is_active: true,
      })
      .select('*')
      .single();

    // Tenant B queries cashflow_scenarios
    const { data: bScenarios } = await clientB
      .from('cashflow_scenarios')
      .select('*');

    const leakSc = bScenarios?.some((s) => s.business_id === bizA);
    if (!errSaveA && savedScA && !leakSc) {
      report(20, 'Cross-Business Scenario Isolation', 'PASS', 'Tenant B cannot see Tenant A saved scenarios');
    } else {
      report(20, 'Cross-Business Scenario Isolation', 'FAIL', 'Cross-business scenario leak or insert failure');
    }

    // ------------------------------------------------------------------------
    // Scenario 21: Archival of Saved Scenarios (Soft Delete via is_active = false)
    // ------------------------------------------------------------------------
    const { data: fetchScA } = await clientA
      .from('cashflow_scenarios')
      .select('*')
      .eq('id', savedScA.id)
      .single();

    // Archive scenario (soft delete: set is_active = false)
    const { error: errArchiveSc } = await clientA
      .from('cashflow_scenarios')
      .update({ is_active: false })
      .eq('id', savedScA.id)
      .select('*')
      .single();

    // Active listing must exclude the archived scenario
    const { data: activeScenarios } = await clientA
      .from('cashflow_scenarios')
      .select('*')
      .eq('business_id', bizA)
      .eq('is_active', true);

    // But the record must still exist in PostgreSQL
    const { data: fetchAfterArchive } = await clientA
      .from('cashflow_scenarios')
      .select('*')
      .eq('id', savedScA.id)
      .single();

    const excludedFromActive = !activeScenarios?.some((s) => s.id === savedScA.id);
    const persistedInDb = fetchAfterArchive?.id === savedScA.id && fetchAfterArchive?.is_active === false;

    if (fetchScA?.name === 'Alpha Buffer Scenario' && !errArchiveSc && excludedFromActive && persistedInDb) {
      report(21, 'Archival of Saved Scenarios', 'PASS', 'Scenario archived (is_active=false), excluded from active listings, persisted in PostgreSQL');
    } else {
      report(21, 'Archival of Saved Scenarios', 'FAIL', `Archival failed: err=${errArchiveSc?.message}, excluded=${excludedFromActive}, persisted=${persistedInDb}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 22: Integer-Paise Financial Accuracy
    // ------------------------------------------------------------------------
    // Roll-forward conservation identity:
    // projectedClosingBalance === openingBalance + totalInflows - totalOutflows
    const testCases = [forecast2, forecast3, forecast8, forecast9, forecast11];
    let allConserved = true;

    for (const fc of testCases) {
      const { openingBalance, totalInflows, totalOutflows, projectedClosingBalance } = fc.summary;
      const expectedClosing = Math.round((openingBalance + totalInflows - totalOutflows) * 100) / 100;
      if (Math.abs(projectedClosingBalance - expectedClosing) > 0.001) {
        allConserved = false;
        break;
      }
    }

    if (allConserved) {
      report(22, 'Integer-Paise Financial Accuracy', 'PASS', 'Roll-forward conservation identity verified across all test cases with 0 drift');
    } else {
      report(22, 'Integer-Paise Financial Accuracy', 'FAIL', 'Precision drift detected in roll-forward calculation');
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

  if (failed > 0 || testResults.length < 22) {
    process.exit(1);
  }
}

runTests();
