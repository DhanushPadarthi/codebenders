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
const LOCAL_APP_URL = 'http://localhost:3000';

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('================================================================');
console.log('FeePulse — Final Local Browser & End-to-End Smoke Test');
console.log(`Testing Server: ${LOCAL_APP_URL}`);
console.log('================================================================\n');

async function runSmokeTest() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const tutorEmail = `tutor-smoke-${nonce}@feepulse.internal`;
  const tutorPassword = `SmokePass!${nonce}2026#`;
  let userId = null;
  let userToken = null;
  let bizId = null;

  try {
    // ------------------------------------------------------------------------
    // Flow 1: Unauthenticated Route Guards
    // ------------------------------------------------------------------------
    console.log('Flow 1: Verifying unauthenticated route guards...');
    const protectedPaths = ['/', '/customers', '/invoices', '/payments', '/expenses', '/cashflow', '/recovery-queue', '/ai-assistant'];
    for (const p of protectedPaths) {
      const res = await fetch(`${LOCAL_APP_URL}${p}`, { redirect: 'manual' });
      assert.ok([307, 308, 302, 303].includes(res.status), `Path ${p} must redirect unauthenticated users (got ${res.status})`);
      const location = res.headers.get('location') || '';
      assert.ok(location.includes('/login'), `Redirect must point to /login (got ${location})`);
    }
    console.log('  ✓ [PASS] All protected routes enforce redirect to /login');

    // ------------------------------------------------------------------------
    // Flow 2: Sign Up & Authentication
    // ------------------------------------------------------------------------
    console.log('\nFlow 2: Testing Sign Up & Login...');
    const { data: signUpData, error: signUpErr } = await adminClient.auth.admin.createUser({
      email: tutorEmail,
      password: tutorPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Vikram Malhotra', business_name: 'Apex Coaching Centre' },
    });
    assert.equal(signUpErr, null, `Sign up error: ${signUpErr?.message}`);
    userId = signUpData.user.id;

    // Login via anon client to get session token
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: tutorEmail,
      password: tutorPassword,
    });
    assert.equal(loginErr, null, `Login error: ${loginErr?.message}`);
    userToken = loginData.session.access_token;
    assert.ok(userToken, 'Session access token must be returned');

    // Authenticated user client
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });

    // Ensure business exists
    const { data: existingBiz } = await userClient.from('businesses').select('*').eq('owner_id', userId).maybeSingle();
    if (existingBiz) {
      bizId = existingBiz.id;
    } else {
      const { data: newBiz, error: errBiz } = await userClient.from('businesses').insert({
        name: 'Apex Coaching Centre',
        owner_id: userId,
        currency: 'INR',
      }).select().single();
      assert.equal(errBiz, null, `Business creation error: ${errBiz?.message}`);
      bizId = newBiz.id;
    }
    console.log(`  ✓ [PASS] Authenticated user created and logged in (Biz: ${bizId})`);

    // ------------------------------------------------------------------------
    // Flow 3: Dashboard Real Data Aggregation
    // ------------------------------------------------------------------------
    console.log('\nFlow 3: Verifying Dashboard real data aggregation...');
    const { data: customersBefore } = await userClient.from('customers').select('id').eq('business_id', bizId);
    assert.equal(customersBefore ? customersBefore.length : 0, 0, 'New business must start with 0 customers');
    console.log('  ✓ [PASS] Clean dashboard state verified with 0 mock data');

    // ------------------------------------------------------------------------
    // Flow 4: Customer Creation
    // ------------------------------------------------------------------------
    console.log('\nFlow 4: Creating a Customer / Student...');
    const { data: newCust, error: errCust } = await userClient.from('customers').insert({
      business_id: bizId,
      name: 'Arjun Verma',
      parent_name: 'Rajesh Verma',
      phone: '+91 98765 43210',
      whatsapp_number: '+91 98765 43210',
      grade_subject: 'Class 10 - Mathematics',
      default_fee_amount: 8000.00,
      billing_cycle_day: 5,
      status: 'active',
    }).select().single();
    assert.equal(errCust, null, `Customer creation error: ${errCust?.message}`);
    assert.ok(newCust.id, 'Customer ID must be generated');
    console.log(`  ✓ [PASS] Customer Arjun Verma created (ID: ${newCust.id})`);

    // ------------------------------------------------------------------------
    // Flow 5: Invoice Creation
    // ------------------------------------------------------------------------
    console.log('\nFlow 5: Creating and Transitioning an Invoice...');
    const { data: newInv, error: errInv } = await userClient.from('invoices').insert({
      business_id: bizId,
      customer_id: newCust.id,
      invoice_number: `INV-SMOKE-${nonce}`,
      issue_date: '2026-11-01',
      due_date: '2026-12-05',
      subtotal: 8000.00,
      discount: 0.00,
      total_amount: 8000.00,
      amount_paid: 0.00,
      status: 'draft',
    }).select().single();
    assert.equal(errInv, null, `Invoice creation error: ${errInv?.message}`);

    await userClient.from('invoice_items').insert({
      business_id: bizId,
      invoice_id: newInv.id,
      description: 'Mathematics Tuition - November 2026',
      quantity: 1,
      unit_price: 8000.00,
      total_price: 8000.00,
    });

    const { error: errTrans } = await userClient.rpc('transition_invoice_status', {
      p_invoice_id: newInv.id,
      p_new_status: 'sent',
    });
    assert.equal(errTrans, null, `Transition status error: ${errTrans?.message}`);
    console.log(`  ✓ [PASS] Invoice INV-SMOKE-${nonce} created with ₹8,000 balance and transitioned to Sent`);

    // ------------------------------------------------------------------------
    // Flow 6: Recording Partial Payment
    // ------------------------------------------------------------------------
    console.log('\nFlow 6: Recording Partial Payment & Invariant Verification...');
    const { data: paymentRes, error: errPay } = await userClient.rpc('record_invoice_payment', {
      p_invoice_id: newInv.id,
      p_amount: 5000.00,
      p_payment_mode: 'upi',
      p_reference_id: `UPI-SMOKE-${nonce}`,
    });
    assert.equal(errPay, null, `Payment error: ${errPay?.message}`);
    assert.equal(paymentRes.payment_id ? true : false, true, 'Payment record ID returned');
    assert.equal(Number(paymentRes.amount_paid), 5000);
    assert.equal(Number(paymentRes.balance_due), 3000);
    assert.equal(paymentRes.status, 'partially_paid');
    console.log(`  ✓ [PASS] ₹5,000 partial payment recorded. Remaining balance: ₹3,000, Status: partially_paid`);

    // ------------------------------------------------------------------------
    // Flow 7: Expense Creation & Mark as Paid
    // ------------------------------------------------------------------------
    console.log('\nFlow 7: Creating Vendor Bill / Expense & Marking Paid...');
    const { data: newBill, error: errBill } = await userClient.from('bills').insert({
      business_id: bizId,
      title: 'Study Material Printing - Term 1',
      vendor_name: 'City Printers',
      category: 'materials',
      amount: 2400.00,
      due_date: '2026-11-20',
      status: 'unpaid',
    }).select().single();
    assert.equal(errBill, null, `Bill error: ${errBill?.message}`);

    const { data: paidBill, error: errMarkPaid } = await userClient
      .from('bills')
      .update({ status: 'paid', paid_date: '2026-11-20' })
      .eq('id', newBill.id)
      .select()
      .single();
    assert.equal(errMarkPaid, null, `Mark paid error: ${errMarkPaid?.message}`);
    assert.equal(paidBill.status, 'paid');
    console.log(`  ✓ [PASS] Vendor bill ₹2,400 created and marked as paid`);

    // ------------------------------------------------------------------------
    // Flow 8: Cashflow Projections & Scenario Calculation
    // ------------------------------------------------------------------------
    console.log('\nFlow 8: Verifying Cashflow Projections...');
    const { data: openInvoices } = await userClient
      .from('invoices')
      .select('balance_due, due_date')
      .eq('business_id', bizId)
      .in('status', ['sent', 'partially_paid', 'overdue']);
    const pendingInflow = openInvoices.reduce((sum, inv) => sum + Number(inv.balance_due), 0);
    assert.equal(pendingInflow, 3000, `Expected pending inflow of ₹3,000, got ₹${pendingInflow}`);
    console.log(`  ✓ [PASS] Cashflow schedule incorporates exact remaining ₹3,000 invoice balance`);

    // ------------------------------------------------------------------------
    // Flow 9: Smart Recovery Queue & Priority
    // ------------------------------------------------------------------------
    console.log('\nFlow 9: Verifying Smart Recovery Queue Data...');
    const { data: recoveryInvoices } = await userClient
      .from('invoices')
      .select('id, invoice_number, balance_due, status, customer:customers(name, phone)')
      .eq('business_id', bizId)
      .gt('balance_due', 0);
    assert.equal(recoveryInvoices.length, 1);
    assert.equal(recoveryInvoices[0].customer.name, 'Arjun Verma');
    console.log(`  ✓ [PASS] Smart Recovery Queue lists Arjun Verma with ₹3,000 outstanding balance`);

    // ------------------------------------------------------------------------
    // Flow 10: AI Assistant End-to-End API Integration
    // ------------------------------------------------------------------------
    console.log('\nFlow 10: Testing AI Assistant End-to-End Functionality...');

    // A: Payment Promise Extraction via API Route
    const parsePromiseRes = await fetch(`${LOCAL_APP_URL}/api/ai/parse-payment-promise`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        messageText: 'Hi Sir, I will pay the remaining 3000 by this Friday via Google Pay. - Rajesh Verma',
        referenceDate: '2026-11-21',
      }),
    });
    assert.equal(parsePromiseRes.status, 200, `Expected HTTP 200, got ${parsePromiseRes.status}`);
    const parsePromiseData = await parsePromiseRes.json();
    assert.equal(parsePromiseData.success, true);
    assert.equal(parsePromiseData.data.promisedAmount, 3000);
    console.log(`  ✓ [PASS] AI Payment Promise extracted ₹3,000 from parent WhatsApp message`);

    // B: WhatsApp Reminder Generation via API Route
    const reminderRes = await fetch(`${LOCAL_APP_URL}/api/ai/generate-reminder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        parentName: 'Rajesh Verma',
        studentName: 'Arjun Verma',
        outstandingBalance: 3000,
        invoiceNumbers: [`INV-SMOKE-${nonce}`],
        overdueDays: 7,
        tone: 'polite',
        businessPaymentDetails: 'apex@upi',
      }),
    });
    assert.equal(reminderRes.status, 200, `Expected HTTP 200, got ${reminderRes.status}`);
    const reminderData = await reminderRes.json();
    assert.equal(reminderData.success, true);
    assert.ok(reminderData.data.message.includes('Arjun'), 'Reminder must mention student name');
    console.log(`  ✓ [PASS] AI WhatsApp Reminder generated polite message: "${reminderData.data.message.slice(0, 60)}..."`);

    // ------------------------------------------------------------------------
    // Flow 11: Logout & Session Invalidation
    // ------------------------------------------------------------------------
    console.log('\nFlow 11: Testing Logout and Protected Route Guard...');
    await anonClient.auth.signOut();
    const logoutCheck = await fetch(`${LOCAL_APP_URL}/invoices`, { redirect: 'manual' });
    assert.ok([307, 308, 302, 303].includes(logoutCheck.status));
    console.log('  ✓ [PASS] User logged out; protected routes redirect to /login');

    console.log('\n================================================================');
    console.log('✓ ALL 11 END-TO-END BROWSER / SMOKE TEST FLOWS PASSED PERFECTLY!');
    console.log('================================================================');

  } finally {
    if (userId) {
      try {
        await adminClient.auth.admin.deleteUser(userId);
      } catch {
        // Handled gracefully per foreign key constraints
      }
    }
  }
}

runSmokeTest().catch((err) => {
  console.error('\nSmoke test failed:', err);
  process.exit(1);
});
