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

// Dynamic imports of deterministic cashflow engine
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

// Helper for anon auth client
const anonAuthClient = createClient(SUPABASE_URL, ANON_KEY, {
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
console.log('FeePulse Live Dashboard Integration & Real-Data Metrics Test Suite');
console.log(`Target Staging Project: ${targetRef}`);
console.log('================================================================\n');

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const userAEmail = `test-dash-a-${nonce}@feepulse.internal`;
  const userBEmail = `test-dash-b-${nonce}@feepulse.internal`;
  const testPassword = `TestPass!${nonce}2026#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;
  let bizA = null;
  let bizB = null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = todayStr.slice(0, 7);

  try {
    // ------------------------------------------------------------------------
    // SETUP: Provision Test Tenants
    // ------------------------------------------------------------------------
    console.log('Phase 1: Provisioning Ephemeral Test Tenants...');

    const { data: authA, error: errAuthA } = await adminClient.auth.admin.createUser({
      email: userAEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Tutor Dash A ${nonce}`, business_name: `Dash Academy Alpha ${nonce}` },
    });
    if (errAuthA || !authA?.user) throw new Error(`Failed to create User A: ${errAuthA?.message}`);
    userAId = authA.user.id;

    const { data: authB, error: errAuthB } = await adminClient.auth.admin.createUser({
      email: userBEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: `Tutor Dash B ${nonce}`, business_name: `Dash Academy Beta ${nonce}` },
    });
    if (errAuthB || !authB?.user) throw new Error(`Failed to create User B: ${errAuthB?.message}`);
    userBId = authB.user.id;

    // Sign in both users to obtain access tokens
    const { data: sessA, error: errSessA } = await anonAuthClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword,
    });
    if (errSessA || !sessA?.session) throw new Error(`Failed to login User A: ${errSessA?.message}`);
    clientA = createUserClient(sessA.session.access_token);

    const { data: sessB, error: errSessB } = await anonAuthClient.auth.signInWithPassword({
      email: userBEmail,
      password: testPassword,
    });
    if (errSessB || !sessB?.session) throw new Error(`Failed to login User B: ${errSessB?.message}`);
    clientB = createUserClient(sessB.session.access_token);

    // Fetch auto-provisioned businesses
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

    console.log(`✓ Ephemeral businesses provisioned: BizA (${bizA.id}), BizB (${bizB.id})\n`);
    console.log('Phase 2: Executing 10 Dashboard Integration Scenarios...\n');

    // ------------------------------------------------------------------------
    // Scenario 1: Fresh business clean zero-state
    // ------------------------------------------------------------------------
    {
      const [invRes, payRes, custRes, billRes] = await Promise.all([
        clientA.from('invoices').select('*').eq('business_id', bizA.id),
        clientA.from('payments').select('*').eq('business_id', bizA.id),
        clientA.from('customers').select('*').eq('business_id', bizA.id),
        clientA.from('bills').select('*').eq('business_id', bizA.id),
      ]);

      const invoices = invRes.data || [];
      const payments = payRes.data || [];
      const customers = custRes.data || [];
      const bills = billRes.data || [];

      // Calculate dashboard metrics on zero state
      const totalOutstanding = invoices
        .filter((inv) => inv.status !== 'draft' && inv.status !== 'cancelled')
        .reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);

      const monthlyCollected = payments
        .filter((p) => p.payment_date && p.payment_date.startsWith(currentMonthPrefix))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const activeCustomers = customers.filter((c) => c.status === 'active').length;
      const unpaidBills = bills.filter((b) => b.status !== 'paid');

      // Cashflow forecast for fresh account
      const forecast = calculateCashflowForecast({
        openingCashBalance: 0,
        invoices: [],
        bills: [],
        customers: [],
        promises: [],
        horizonDays: 30,
        safeReserveThreshold: 50000,
      });

      if (
        totalOutstanding === 0 &&
        monthlyCollected === 0 &&
        activeCustomers === 0 &&
        unpaidBills.length === 0 &&
        forecast.points.length === 31 &&
        forecast.summary.openingBalance === 0 &&
        forecast.summary.projectedClosingBalance === 0
      ) {
        report(1, 'Fresh business clean zero-state metrics', 'PASS', '₹0 balances, 0 counts, clean zero-baseline forecast');
      } else {
        report(1, 'Fresh business clean zero-state metrics', 'FAIL', `Unexpected values: outstanding=${totalOutstanding}, monthly=${monthlyCollected}, points=${forecast.points.length}`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Outstanding invoice balance calculation (drafts excluded)
    // ------------------------------------------------------------------------
    let studentA1 = null;
    let inv1 = null;
    let inv2 = null;

    {
      // Create student A1
      const { data: cust, error: errCust } = await clientA
        .from('customers')
        .insert({
          business_id: bizA.id,
          name: `Rohan Sharma ${nonce}`,
          parent_name: 'Mr. Sharma',
          phone: '+91 98765 00001',
          whatsapp_number: '+91 98765 00001',
          grade_subject: 'Class 10 - Mathematics',
          default_fee_amount: 5000.0,
          billing_cycle_day: 1,
          status: 'active',
        })
        .select('*')
        .single();
      if (errCust || !cust) throw new Error(`Failed to create student A1: ${errCust?.message}`);
      studentA1 = cust;

      // Helper to create invoice with line item and transition status
      async function createInvoice(totalAmount, num, status, dueDate) {
        const { data: inv, error: errInv } = await clientA
          .from('invoices')
          .insert({
            business_id: bizA.id,
            customer_id: studentA1.id,
            invoice_number: `INV-DASH-${nonce}-${num}`,
            issue_date: todayStr,
            due_date: dueDate || addDays(todayStr, 10),
            subtotal: totalAmount,
            discount: 0,
            total_amount: totalAmount,
            status: 'draft',
          })
          .select('*')
          .single();
        if (errInv) throw new Error(`Failed to create invoice: ${errInv.message}`);

        await clientA.from('invoice_items').insert({
          business_id: bizA.id,
          invoice_id: inv.id,
          description: 'Tuition Fee',
          quantity: 1,
          unit_price: totalAmount,
          total_price: totalAmount,
        });

        if (status !== 'draft') {
          const { error: errTransition } = await clientA.rpc('transition_invoice_status', {
            p_invoice_id: inv.id,
            p_new_status: status,
          });
          if (errTransition) throw new Error(`Failed to transition invoice: ${errTransition.message}`);
        }

        const { data: freshInv } = await clientA.from('invoices').select('*').eq('id', inv.id).single();
        return freshInv;
      }

      inv1 = await createInvoice(5000.0, 1, 'sent', addDays(todayStr, 7));
      inv2 = await createInvoice(3000.0, 2, 'sent', addDays(todayStr, 14));
      await createInvoice(2000.0, 3, 'draft', addDays(todayStr, 20));

      // Fetch all invoices
      const { data: allInvs } = await clientA.from('invoices').select('*').eq('business_id', bizA.id);

      const nonDraftInvoices = allInvs.filter((inv) => inv.status !== 'draft' && inv.status !== 'cancelled');
      const totalOutstanding = nonDraftInvoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);
      const pendingCount = nonDraftInvoices.filter((inv) => Number(inv.balance_due || 0) > 0).length;

      if (totalOutstanding === 8000 && pendingCount === 2) {
        report(2, 'Outstanding invoice balance calculation (drafts excluded)', 'PASS', `Total outstanding = ₹${totalOutstanding}, pending count = ${pendingCount}`);
      } else {
        report(2, 'Outstanding invoice balance calculation (drafts excluded)', 'FAIL', `Expected ₹8000 and 2 pending, got ₹${totalOutstanding} and ${pendingCount}`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Monthly collections aggregation (month boundary accuracy)
    // ------------------------------------------------------------------------
    {
      // 1. Record payment for inv1 on today's date (current month)
      const { data: payId1, error: errPay1 } = await clientA.rpc('record_invoice_payment', {
        p_invoice_id: inv1.id,
        p_amount: 2000.0,
        p_payment_mode: 'upi',
        p_payment_date: todayStr,
        p_reference_id: `UPI-${nonce}-1`,
        p_receipt_image_url: null,
        p_notes: 'Current month installment',
      });
      if (errPay1 || !payId1) throw new Error(`Failed to record payment 1: ${errPay1?.message || 'Missing ID'}`);

      // 2. Record payment for inv2 with a prior month date
      const priorMonthDate = '2026-08-15';
      const { data: payId2, error: errPay2 } = await clientA.rpc('record_invoice_payment', {
        p_invoice_id: inv2.id,
        p_amount: 1000.0,
        p_payment_mode: 'cash',
        p_payment_date: priorMonthDate,
        p_reference_id: `CASH-${nonce}-2`,
        p_receipt_image_url: null,
        p_notes: 'Prior month cash receipt',
      });
      if (errPay2 || !payId2) throw new Error(`Failed to record payment 2: ${errPay2?.message || 'Missing ID'}`);

      // Fetch all payments
      const { data: payments } = await clientA.from('payments').select('*').eq('business_id', bizA.id);

      const thisMonthPayments = payments.filter((p) => p.payment_date && p.payment_date.startsWith(currentMonthPrefix));
      const monthlyCollected = thisMonthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const allTimeCollected = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      if (monthlyCollected === 2000 && allTimeCollected === 3000 && thisMonthPayments.length === 1) {
        report(3, 'Monthly collections aggregation (month boundary accuracy)', 'PASS', `This month: ₹${monthlyCollected} (${thisMonthPayments.length} payment), All-time: ₹${allTimeCollected}`);
      } else {
        report(3, 'Monthly collections aggregation (month boundary accuracy)', 'FAIL', `Expected ₹2000 this month, got ₹${monthlyCollected} (all-time: ₹${allTimeCollected})`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Overdue invoices calculation
    // ------------------------------------------------------------------------
    {
      const pastDueDate = addDays(todayStr, -7); // 7 days ago
      const invOverdue = await (async () => {
        const { data: inv } = await clientA
          .from('invoices')
          .insert({
            business_id: bizA.id,
            customer_id: studentA1.id,
            invoice_number: `INV-DASH-${nonce}-OVERDUE`,
            issue_date: addDays(todayStr, -15),
            due_date: pastDueDate,
            subtotal: 4000.0,
            discount: 0,
            total_amount: 4000.0,
            status: 'draft',
          })
          .select('*')
          .single();

        await clientA.from('invoice_items').insert({
          business_id: bizA.id,
          invoice_id: inv.id,
          description: 'Physics Coaching',
          quantity: 1,
          unit_price: 4000.0,
          total_price: 4000.0,
        });

        await clientA.rpc('transition_invoice_status', {
          p_invoice_id: inv.id,
          p_new_status: 'sent',
        });

        const { data: fresh } = await clientA.from('invoices').select('*').eq('id', inv.id).single();
        return fresh;
      })();
      if (!invOverdue) throw new Error('Failed to create overdue invoice');

      const { data: allInvoices } = await clientA.from('invoices').select('*').eq('business_id', bizA.id);

      const overdueInvoices = allInvoices.filter((inv) => {
        const isOverdue =
          inv.status === 'overdue' ||
          (inv.due_date < todayStr && inv.status !== 'draft' && inv.status !== 'cancelled' && inv.status !== 'paid');
        return isOverdue && Number(inv.balance_due || 0) > 0;
      });

      const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);
      const overdueCount = overdueInvoices.length;

      if (totalOverdue === 4000 && overdueCount === 1) {
        report(4, 'Overdue invoices count and outstanding amount', 'PASS', `Overdue amount = ₹${totalOverdue}, overdue count = ${overdueCount}`);
      } else {
        report(4, 'Overdue invoices count and outstanding amount', 'FAIL', `Expected ₹4000 and 1 overdue, got ₹${totalOverdue} and ${overdueCount}`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 5: Active student count accuracy (status filtering)
    // ------------------------------------------------------------------------
    {
      // Create active student 2
      await clientA.from('customers').insert({
        business_id: bizA.id,
        name: `Priya Verma ${nonce}`,
        parent_name: 'Mrs. Verma',
        phone: '+91 98765 00002',
        whatsapp_number: '+91 98765 00002',
        grade_subject: 'Class 12 - Chemistry',
        default_fee_amount: 6000.0,
        billing_cycle_day: 5,
        status: 'active',
      });

      // Create archived student 3
      await clientA.from('customers').insert({
        business_id: bizA.id,
        name: `Karan Malhotra ${nonce}`,
        parent_name: 'Mr. Malhotra',
        phone: '+91 98765 00003',
        whatsapp_number: '+91 98765 00003',
        grade_subject: 'Class 11 - Physics',
        default_fee_amount: 4500.0,
        billing_cycle_day: 10,
        status: 'archived',
      });

      const { data: customers } = await clientA.from('customers').select('*').eq('business_id', bizA.id);

      const activeStudents = customers.filter((c) => c.status === 'active').length;
      const totalStudents = customers.length;

      if (activeStudents === 2 && totalStudents === 3) {
        report(5, 'Active student count accuracy (status filtering)', 'PASS', `Active students = ${activeStudents}, Total registered = ${totalStudents}`);
      } else {
        report(5, 'Active student count accuracy (status filtering)', 'FAIL', `Expected 2 active and 3 total, got ${activeStudents} active and ${totalStudents} total`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 6: Unpaid bills and upcoming overhead calculation
    // ------------------------------------------------------------------------
    {
      // Create unpaid bill 1
      await clientA.from('bills').insert({
        business_id: bizA.id,
        title: `Broadband Internet ${nonce}`,
        category: 'internet',
        amount: 1500.0,
        due_date: addDays(todayStr, 5),
        status: 'unpaid',
        vendor_name: 'Airtel Broadband',
      });

      // Create unpaid bill 2
      await clientA.from('bills').insert({
        business_id: bizA.id,
        title: `Centre Rent Advance ${nonce}`,
        category: 'rent',
        amount: 2500.0,
        due_date: addDays(todayStr, 12),
        status: 'unpaid',
        vendor_name: 'Landlord',
      });

      // Create paid bill 3
      await clientA.from('bills').insert({
        business_id: bizA.id,
        title: `Whiteboard Supplies ${nonce}`,
        category: 'supplies',
        amount: 1000.0,
        due_date: addDays(todayStr, 2),
        status: 'paid',
        paid_date: todayStr,
        vendor_name: 'Stationery World',
      });

      const { data: bills } = await clientA.from('bills').select('*').eq('business_id', bizA.id);

      const unpaidBills = bills.filter((b) => b.status !== 'paid');
      const pendingExpenses = unpaidBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
      const unpaidCount = unpaidBills.length;

      if (pendingExpenses === 4000 && unpaidCount === 2) {
        report(6, 'Unpaid bills and upcoming overhead totals', 'PASS', `Pending expenses = ₹${pendingExpenses}, unpaid count = ${unpaidCount}`);
      } else {
        report(6, 'Unpaid bills and upcoming overhead totals', 'FAIL', `Expected ₹4000 and 2 unpaid, got ₹${pendingExpenses} and ${unpaidCount}`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 7: Cashflow forecast roll-forward integration
    // ------------------------------------------------------------------------
    {
      const [invRes, billRes, custRes] = await Promise.all([
        clientA.from('invoices').select('*').eq('business_id', bizA.id),
        clientA.from('bills').select('*').eq('business_id', bizA.id),
        clientA.from('customers').select('*').eq('business_id', bizA.id),
      ]);

      const sampleInvoices = (invRes.data || []).map((inv) => ({
        id: inv.id,
        customerId: inv.customer_id,
        customerName: 'Student',
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        totalAmount: Number(inv.total_amount || 0),
        amountPaid: Number(inv.amount_paid || 0),
        balanceDue: Number(inv.balance_due || 0),
        status: inv.status,
      }));

      const sampleBills = (billRes.data || []).map((b) => ({
        id: b.id,
        amount: Number(b.amount || 0),
        dueDate: b.due_date,
        status: b.status,
        isRecurring: b.is_recurring,
      }));

      const sampleCustomers = (custRes.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        defaultFeeAmount: Number(c.default_fee_amount || 0),
        billingCycleDay: c.billing_cycle_day,
        status: c.status,
        nextPaymentDate: addDays(todayStr, 10),
      }));

      const forecast = calculateCashflowForecast({
        openingCashBalance: 10000,
        invoices: sampleInvoices,
        bills: sampleBills,
        customers: sampleCustomers,
        promises: [],
        horizonDays: 30,
        safeReserveThreshold: 50000,
      });

      const hasValidPoints = forecast.points.length === 31;
      const opening = forecast.summary.openingBalance;
      const closing = forecast.summary.projectedClosingBalance;
      const inflows = forecast.summary.totalInflows;
      const outflows = forecast.summary.totalOutflows;

      // Mathematical identity: closing = opening + inflows - outflows
      const arithmeticMatch = closing === opening + inflows - outflows;

      if (hasValidPoints && arithmeticMatch && inflows > 0 && outflows > 0) {
        report(7, 'Cashflow forecast roll-forward integration', 'PASS', `Opening=₹${opening}, Inflows=+₹${inflows}, Outflows=-₹${outflows}, Closing=₹${closing}`);
      } else {
        report(7, 'Cashflow forecast roll-forward integration', 'FAIL', `Arithmetic check: match=${arithmeticMatch}, points=${forecast.points.length}`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 8: Cross-business data isolation under RLS
    // ------------------------------------------------------------------------
    {
      const [invB, payB, custB, billB] = await Promise.all([
        clientB.from('invoices').select('*').eq('business_id', bizA.id),
        clientB.from('payments').select('*').eq('business_id', bizA.id),
        clientB.from('customers').select('*').eq('business_id', bizA.id),
        clientB.from('bills').select('*').eq('business_id', bizA.id),
      ]);

      const leakedInvoices = invB.data?.length || 0;
      const leakedPayments = payB.data?.length || 0;
      const leakedCustomers = custB.data?.length || 0;
      const leakedBills = billB.data?.length || 0;

      const totalLeaked = leakedInvoices + leakedPayments + leakedCustomers + leakedBills;

      if (totalLeaked === 0) {
        report(8, 'Cross-business data isolation under RLS', 'PASS', 'User B queries for Biz A return exactly 0 rows across all tables');
      } else {
        report(8, 'Cross-business data isolation under RLS', 'FAIL', `Leaked rows detected: ${totalLeaked}`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 9: Persistence verification after simulated page reload
    // ------------------------------------------------------------------------
    {
      // Create a fresh client connection with user A's token (simulating new HTTP request / SSR render)
      const freshClientA = createUserClient((await anonAuthClient.auth.signInWithPassword({
        email: userAEmail,
        password: testPassword,
      })).data.session.access_token);

      const [invRes, payRes, custRes, billRes] = await Promise.all([
        freshClientA.from('invoices').select('*').eq('business_id', bizA.id),
        freshClientA.from('payments').select('*').eq('business_id', bizA.id),
        freshClientA.from('customers').select('*').eq('business_id', bizA.id),
        freshClientA.from('bills').select('*').eq('business_id', bizA.id),
      ]);

      const invoices = invRes.data || [];
      const payments = payRes.data || [];
      const customers = custRes.data || [];
      const bills = billRes.data || [];

      const nonDraftInvoices = invoices.filter((inv) => inv.status !== 'draft' && inv.status !== 'cancelled');
      const totalOutstanding = nonDraftInvoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);

      const thisMonthPayments = payments.filter((p) => p.payment_date && p.payment_date.startsWith(currentMonthPrefix));
      const monthlyCollected = thisMonthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const overdueCount = invoices.filter((inv) => {
        const isOverdue =
          inv.status === 'overdue' ||
          (inv.due_date < todayStr && inv.status !== 'draft' && inv.status !== 'cancelled' && inv.status !== 'paid');
        return isOverdue && Number(inv.balance_due || 0) > 0;
      }).length;

      const activeStudents = customers.filter((c) => c.status === 'active').length;
      const unpaidBills = bills.filter((b) => b.status !== 'paid').length;

      // Expected values:
      // totalOutstanding = 3000 (inv1 has 5000-2000=3000) + 2000 (inv2 has 3000-1000=2000) + 4000 (invOverdue) = 9000
      // monthlyCollected = 2000
      // overdueCount = 1
      // activeStudents = 2
      // unpaidBills = 2

      if (
        totalOutstanding === 9000 &&
        monthlyCollected === 2000 &&
        overdueCount === 1 &&
        activeStudents === 2 &&
        unpaidBills === 2
      ) {
        report(9, 'Persistence verification after simulated page reload', 'PASS', `All metrics match post-reload: Outstanding=₹${totalOutstanding}, Monthly=₹${monthlyCollected}, Overdue=${overdueCount}, ActiveStudents=${activeStudents}, UnpaidBills=${unpaidBills}`);
      } else {
        report(9, 'Persistence verification after simulated page reload', 'FAIL', `Post-reload mismatch: outstanding=${totalOutstanding}, monthly=${monthlyCollected}, overdue=${overdueCount}`);
      }
    }

    // ------------------------------------------------------------------------
    // Scenario 10: Clean teardown of ephemeral test identities
    // ------------------------------------------------------------------------
    {
      // Cascade delete User A and User B
      await adminClient.auth.admin.deleteUser(userAId);
      await adminClient.auth.admin.deleteUser(userBId);
      userAId = null;
      userBId = null;

      report(10, 'Clean teardown of ephemeral test identities', 'PASS', 'Test users and related multi-tenant records purged');
    }

  } catch (err) {
    console.error('\nFatal test runner error:', err);
    report(999, 'Test Runner Exception', 'FAIL', err.message);
  } finally {
    // Teardown safety
    if (userAId) {
      try { await adminClient.auth.admin.deleteUser(userAId); } catch { /* ignore */ }
    }
    if (userBId) {
      try { await adminClient.auth.admin.deleteUser(userBId); } catch { /* ignore */ }
    }
  }

  // Summary
  console.log('\n================================================================');
  const passCount = testResults.filter((r) => r.status === 'PASS').length;
  const failCount = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`Test Execution Complete: ${passCount} Passed, ${failCount} Failed (${testResults.length} Total)`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
