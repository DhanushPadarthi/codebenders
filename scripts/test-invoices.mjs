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

// Anonymous unauthenticated client
const anonAuthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('================================================================');
console.log('FeePulse Invoice Management RLS Integration Test Suite');
console.log(`Target Staging Project: ${targetRef}`);
console.log('================================================================\n');

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const userAEmail = `test-inv-a-${nonce}@feepulse.internal`;
  const userBEmail = `test-inv-b-${nonce}@feepulse.internal`;
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

  try {
    // ------------------------------------------------------------------------
    // SETUP: Provision Test Identifiers via Admin API
    // ------------------------------------------------------------------------
    console.log('Phase 1: Provisioning Ephemeral Test Tenants & Students...');

    const { data: authA, error: errAuthA } = await adminClient.auth.admin.createUser({
      email: userAEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Tenant Tutor Alpha' },
    });
    if (errAuthA || !authA.user) {
      throw new Error(`Failed creating user A: ${errAuthA?.message}`);
    }
    userAId = authA.user.id;

    const { data: authB, error: errAuthB } = await adminClient.auth.admin.createUser({
      email: userBEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Tenant Tutor Beta' },
    });
    if (errAuthB || !authB.user) {
      throw new Error(`Failed creating user B: ${errAuthB?.message}`);
    }
    userBId = authB.user.id;

    // Sign in as User A
    const { data: loginA, error: errLoginA } = await anonAuthClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword,
    });
    if (errLoginA || !loginA.session) {
      throw new Error(`User A login failed: ${errLoginA?.message}`);
    }
    clientA = createUserClient(loginA.session.access_token);

    // Sign in as User B
    const { data: loginB, error: errLoginB } = await anonAuthClient.auth.signInWithPassword({
      email: userBEmail,
      password: testPassword,
    });
    if (errLoginB || !loginB.session) {
      throw new Error(`User B login failed: ${errLoginB?.message}`);
    }
    clientB = createUserClient(loginB.session.access_token);

    // Fetch provisioned businesses
    const { data: bA, error: errBA } = await clientA
      .from('businesses')
      .select('*')
      .eq('owner_id', userAId)
      .single();
    if (errBA || !bA) throw new Error(`User A business not provisioned: ${errBA?.message}`);
    bizA = bA;

    const { data: bB, error: errBB } = await clientB
      .from('businesses')
      .select('*')
      .eq('owner_id', userBId)
      .single();
    if (errBB || !bB) throw new Error(`User B business not provisioned: ${errBB?.message}`);
    bizB = bB;

    // Enroll students for Tenant A
    const { data: stA1, error: errStA1 } = await clientA
      .from('customers')
      .insert({
        business_id: bizA.id,
        name: 'Rohan Verma',
        parent_name: 'Sunil Verma',
        grade_subject: 'Grade 11 Mathematics',
        phone: '+91 98200 11111',
        whatsapp_number: '+91 98200 11111',
        default_fee_amount: 6000.00,
        billing_cycle_day: 1,
      })
      .select('*')
      .single();
    if (errStA1 || !stA1) throw new Error(`Failed to create student A1: ${errStA1?.message}`);
    studentA1 = stA1;

    const { data: stA2, error: errStA2 } = await clientA
      .from('customers')
      .insert({
        business_id: bizA.id,
        name: 'Ananya Deshmukh',
        parent_name: 'Pooja Deshmukh',
        grade_subject: 'Grade 12 Physics',
        phone: '+91 98200 22222',
        whatsapp_number: '+91 98200 22222',
        default_fee_amount: 7500.00,
        billing_cycle_day: 5,
      })
      .select('*')
      .single();
    if (errStA2 || !stA2) throw new Error(`Failed to create student A2: ${errStA2?.message}`);
    studentA2 = stA2;

    // Enroll student for Tenant B
    const { data: stB1, error: errStB1 } = await clientB
      .from('customers')
      .insert({
        business_id: bizB.id,
        name: 'Kabir Mehta',
        parent_name: 'Rajeev Mehta',
        grade_subject: 'Grade 10 ICSE Science',
        phone: '+91 98200 33333',
        whatsapp_number: '+91 98200 33333',
        default_fee_amount: 5000.00,
        billing_cycle_day: 10,
      })
      .select('*')
      .single();
    if (errStB1 || !stB1) throw new Error(`Failed to create student B1: ${errStB1?.message}`);
    studentB1 = stB1;

    console.log(`  Tenant A ID: ${userAId} | Business A ID: ${bizA.id}`);
    console.log(`  Tenant B ID: ${userBId} | Business B ID: ${bizB.id}`);
    console.log(`  Student A1: ${studentA1.id} | Student A2: ${studentA2.id} | Student B1: ${studentB1.id}`);
    console.log('Provisioning complete.\n');

    console.log('Phase 2: Executing 20 Multi-Tenant Invoice Scenarios...');

    // ------------------------------------------------------------------------
    // SCENARIO 1: Authenticated Invoice Listing (Clean Empty State for New Tutor)
    // ------------------------------------------------------------------------
    const { data: initialInvoices, error: errInit } = await clientA
      .from('invoices')
      .select('*')
      .eq('business_id', bizA.id);

    if (!errInit && Array.isArray(initialInvoices) && initialInvoices.length === 0) {
      report(1, 'Authenticated Invoice Listing (Clean Empty State)', 'PASS', '0 invoices returned for new tutor');
    } else {
      report(1, 'Authenticated Invoice Listing (Clean Empty State)', 'FAIL', `Expected 0 invoices, got ${initialInvoices?.length}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 2: Create Draft Invoice with Single Line Item
    // ------------------------------------------------------------------------
    let inv1Id = null;
    let inv1ItemId = null;
    const { data: createdInv1, error: errCreateInv1 } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA1.id,
        invoice_number: 'INV-0001',
        issue_date: '2026-11-21',
        due_date: '2026-11-28',
        subtotal: 0,
        discount: 0,
        total_amount: 0,
        notes: 'Monthly tuition fee for Mathematics batch',
      })
      .select('*')
      .single();

    if (!errCreateInv1 && createdInv1) {
      inv1Id = createdInv1.id;
      const { data: item1, error: errItem1 } = await clientA
        .from('invoice_items')
        .insert({
          business_id: bizA.id,
          invoice_id: inv1Id,
          description: 'Grade 11 Mathematics - Monthly Tuition Fee',
          quantity: 1,
          unit_price: 6000.00,
          total_price: 6000.00,
        })
        .select('*')
        .single();

      if (!errItem1 && item1) {
        inv1ItemId = item1.id;
        // Verify invoice was updated by trigger
        const { data: syncedInv1 } = await clientA
          .from('invoices')
          .select('*')
          .eq('id', inv1Id)
          .single();

        if (syncedInv1 && Number(syncedInv1.subtotal) === 6000 && Number(syncedInv1.total_amount) === 6000 && syncedInv1.status === 'draft') {
          report(2, 'Create Draft Invoice with Single Line Item', 'PASS', `Created ${syncedInv1.invoice_number} (₹6,000.00, status: draft)`);
        } else {
          report(2, 'Create Draft Invoice with Single Line Item', 'FAIL', `Subtotal: ${syncedInv1?.subtotal}, status: ${syncedInv1?.status}`);
        }
      } else {
        report(2, 'Create Draft Invoice with Single Line Item', 'FAIL', `Item insert failed: ${errItem1?.message}`);
      }
    } else {
      report(2, 'Create Draft Invoice with Single Line Item', 'FAIL', `Invoice insert failed: ${errCreateInv1?.message}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 3: Invoice Number Uniqueness and Sequencing
    // ------------------------------------------------------------------------
    // Duplicate invoice number for same business must fail
    const { error: errDupNumber } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA1.id,
        invoice_number: 'INV-0001', // duplicate
        issue_date: '2026-11-21',
        due_date: '2026-11-28',
        total_amount: 0,
      });

    // Unique invoice number for same business must succeed
    let inv2Id = null;
    const { data: createdInv2, error: errCreateInv2 } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA2.id,
        invoice_number: 'INV-0002',
        issue_date: '2026-11-21',
        due_date: '2026-11-30',
        subtotal: 0,
        discount: 0,
        total_amount: 0,
      })
      .select('*')
      .single();

    if (errDupNumber && !errCreateInv2 && createdInv2) {
      inv2Id = createdInv2.id;
      report(3, 'Invoice Number Uniqueness & Sequencing', 'PASS', `Duplicate INV-0001 rejected (${errDupNumber.code || '23505'}); INV-0002 accepted`);
    } else {
      report(3, 'Invoice Number Uniqueness & Sequencing', 'FAIL', `Duplicate error: ${errDupNumber?.message}, Inv2 error: ${errCreateInv2?.message}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 4: Multiple Invoice Line Items Insertion
    // ------------------------------------------------------------------------
    const lineItemsToInsert = [
      {
        business_id: bizA.id,
        invoice_id: inv2Id,
        description: 'Grade 12 Physics Theory Classes',
        quantity: 1,
        unit_price: 4500.00,
        total_price: 4500.00,
      },
      {
        business_id: bizA.id,
        invoice_id: inv2Id,
        description: 'Physics Laboratory & Practical Workbook',
        quantity: 1,
        unit_price: 1500.00,
        total_price: 1500.00,
      },
      {
        business_id: bizA.id,
        invoice_id: inv2Id,
        description: 'CBSE Board Mock Test Series',
        quantity: 2,
        unit_price: 750.00,
        total_price: 1500.00,
      },
    ];

    const { data: insertedItems, error: errInsertItems } = await clientA
      .from('invoice_items')
      .insert(lineItemsToInsert)
      .select('*');

    if (!errInsertItems && insertedItems && insertedItems.length === 3) {
      report(4, 'Multiple Invoice Line Items Insertion', 'PASS', `Inserted 3 line items on INV-0002`);
    } else {
      report(4, 'Multiple Invoice Line Items Insertion', 'FAIL', `Line items insert error: ${errInsertItems?.message}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 5: Automatic Subtotal Trigger Calculation (trg_invoice_items_sync)
    // ------------------------------------------------------------------------
    // 4500 + 1500 + 1500 = 7500.00
    const { data: syncedInv2, error: errSyncInv2 } = await clientA
      .from('invoices')
      .select('*')
      .eq('id', inv2Id)
      .single();

    if (!errSyncInv2 && syncedInv2 && Number(syncedInv2.subtotal) === 7500.00 && Number(syncedInv2.total_amount) === 7500.00) {
      report(5, 'Automatic Subtotal Trigger Calculation', 'PASS', `Trigger calculated subtotal: ₹7,500.00 automatically from 3 items`);
    } else {
      report(5, 'Automatic Subtotal Trigger Calculation', 'FAIL', `Expected ₹7,500.00, got subtotal: ${syncedInv2?.subtotal}, total: ${syncedInv2?.total_amount}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 6: Discount Subtraction and Bounds Enforcement
    // ------------------------------------------------------------------------
    // Applying ₹500 discount: subtotal 7500 - 500 = total 7000
    const { data: discInv, error: errDisc } = await clientA
      .from('invoices')
      .update({ discount: 500.00 })
      .eq('id', inv2Id)
      .select('*')
      .single();

    // Attempting negative discount (violates CHECK (discount >= 0))
    const { error: errNegDisc } = await clientA
      .from('invoices')
      .update({ discount: -100.00 })
      .eq('id', inv2Id);

    if (!errDisc && discInv && Number(discInv.total_amount) === 7000.00 && errNegDisc) {
      report(6, 'Discount Subtraction & Bounds Enforcement', 'PASS', `Discount ₹500 applied (total: ₹7,000.00); negative discount rejected (${errNegDisc.code || '23514'})`);
    } else {
      report(6, 'Discount Subtraction & Bounds Enforcement', 'FAIL', `Total: ${discInv?.total_amount}, negative discount err: ${errNegDisc?.message}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 7: Due Date Validation (due_date >= issue_date)
    // ------------------------------------------------------------------------
    const { error: errPastDueDate } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA1.id,
        invoice_number: 'INV-INVALID-DUE',
        issue_date: '2026-11-21',
        due_date: '2026-11-15', // Due before issue date
        total_amount: 0,
      });

    if (errPastDueDate) {
      report(7, 'Due Date Validation (due_date >= issue_date)', 'PASS', `Rejected due_date < issue_date (${errPastDueDate.message || errPastDueDate.code})`);
    } else {
      report(7, 'Due Date Validation (due_date >= issue_date)', 'FAIL', `Expected rejection of due_date before issue_date`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 8: Customer/Business Relationship Enforcement (Composite FK)
    // ------------------------------------------------------------------------
    // Verify invoice correctly joins to customer table
    const { data: invWithCustomer, error: errJoin } = await clientA
      .from('invoices')
      .select('*, customers!inner(*)')
      .eq('id', inv1Id)
      .single();

    if (!errJoin && invWithCustomer && invWithCustomer.customers && invWithCustomer.customers.id === studentA1.id) {
      report(8, 'Customer/Business Relationship Enforcement', 'PASS', `Invoice linked to customer ${invWithCustomer.customers.name}`);
    } else {
      report(8, 'Customer/Business Relationship Enforcement', 'FAIL', `Join error: ${errJoin?.message}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 9: Unauthenticated Access Rejection
    // ------------------------------------------------------------------------
    const pureAnonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: anonInvoices, error: anonInvErr } = await pureAnonClient
      .from('invoices')
      .select('*');

    const { data: anonItems, error: anonItemErr } = await pureAnonClient
      .from('invoice_items')
      .select('*');

    const { error: anonInsertErr } = await pureAnonClient
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA1.id,
        invoice_number: 'INV-ANON-INJECT',
        issue_date: '2026-11-21',
        due_date: '2026-11-28',
        total_amount: 0,
      });

    const anonReadSafe = (anonInvErr || !anonInvoices || anonInvoices.length === 0) && (anonItemErr || !anonItems || anonItems.length === 0);
    const anonWriteBlocked = Boolean(anonInsertErr);

    if (anonReadSafe && anonWriteBlocked) {
      report(9, 'Unauthenticated Access Rejection', 'PASS', 'Anonymous queries return 0 rows; anonymous insert blocked');
    } else {
      report(9, 'Unauthenticated Access Rejection', 'FAIL', `Read safe: ${anonReadSafe}, Write blocked: ${anonWriteBlocked}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 10: Cross-Business Invoice Access Rejection
    // ------------------------------------------------------------------------
    const { data: tenantBInvoices } = await clientB
      .from('invoices')
      .select('*')
      .eq('id', inv1Id);

    const { data: tenantBItems } = await clientB
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', inv1Id);

    if ((!tenantBInvoices || tenantBInvoices.length === 0) && (!tenantBItems || tenantBItems.length === 0)) {
      report(10, 'Cross-Business Invoice Access Rejection', 'PASS', 'Tenant B cannot see Tenant A invoices or line items');
    } else {
      report(10, 'Cross-Business Invoice Access Rejection', 'FAIL', `Tenant B saw ${tenantBInvoices?.length} invoices, ${tenantBItems?.length} items`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 11: Cross-Business Customer Reference Rejection
    // ------------------------------------------------------------------------
    // Tenant B attempts to create invoice referencing Tenant A's customer
    const { error: errCrossCustomer } = await clientB
      .from('invoices')
      .insert({
        business_id: bizB.id,
        customer_id: studentA1.id, // Belongs to Tenant A!
        invoice_number: 'INV-B-0001',
        issue_date: '2026-11-21',
        due_date: '2026-11-28',
        total_amount: 0,
      });

    if (errCrossCustomer) {
      report(11, 'Cross-Business Customer Reference Rejection', 'PASS', `Rejected cross-tenant customer assignment (${errCrossCustomer.code || '23503'})`);
    } else {
      report(11, 'Cross-Business Customer Reference Rejection', 'FAIL', 'Cross-business invoice creation should have failed composite FK check');
    }

    // ------------------------------------------------------------------------
    // SCENARIO 12: Line Item Edit While Invoice in Draft Status
    // ------------------------------------------------------------------------
    // Update quantity on draft inv1
    const { data: updatedItem, error: errUpdateItem } = await clientA
      .from('invoice_items')
      .update({ quantity: 2, total_price: 12000.00 })
      .eq('id', inv1ItemId)
      .select('*')
      .single();

    const { data: reSyncedInv1 } = await clientA
      .from('invoices')
      .select('*')
      .eq('id', inv1Id)
      .single();

    if (!errUpdateItem && updatedItem && reSyncedInv1 && Number(reSyncedInv1.subtotal) === 12000.00) {
      report(12, 'Line Item Edit in Draft Status', 'PASS', 'Line item quantity updated and subtotal recalculated to ₹12,000.00');
    } else {
      report(12, 'Line Item Edit in Draft Status', 'FAIL', `Update error: ${errUpdateItem?.message}, subtotal: ${reSyncedInv1?.subtotal}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 13: Line Item Modification Rejection After Finalization
    // ------------------------------------------------------------------------
    // Transition inv1 to 'sent'
    const { error: errTransSent } = await clientA.rpc('transition_invoice_status', {
      p_invoice_id: inv1Id,
      p_new_status: 'sent',
    });

    if (errTransSent) {
      throw new Error(`Failed to transition inv1 to sent: ${errTransSent.message}`);
    }

    // Try to insert a new line item on the now-sent invoice
    const { error: errInsertSentItem } = await clientA
      .from('invoice_items')
      .insert({
        business_id: bizA.id,
        invoice_id: inv1Id,
        description: 'Post-Finalization Unauthorized Item',
        quantity: 1,
        unit_price: 1000.00,
        total_price: 1000.00,
      });

    // Try to update an existing line item on the sent invoice
    const { error: errUpdateSentItem } = await clientA
      .from('invoice_items')
      .update({ unit_price: 7000.00 })
      .eq('id', inv1ItemId);

    // Try to delete a line item on the sent invoice
    const { error: errDeleteSentItem } = await clientA
      .from('invoice_items')
      .delete()
      .eq('id', inv1ItemId);

    if (errInsertSentItem && errUpdateSentItem && errDeleteSentItem) {
      report(13, 'Line Item Modification Rejection After Finalization', 'PASS', 'Trigger blocked INSERT, UPDATE, and DELETE on finalized invoice');
    } else {
      report(13, 'Line Item Modification Rejection After Finalization', 'FAIL', `Insert blocked: ${Boolean(errInsertSentItem)}, Update: ${Boolean(errUpdateSentItem)}, Delete: ${Boolean(errDeleteSentItem)}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 14: Valid Status Transition: draft -> sent
    // ------------------------------------------------------------------------
    // Create draft invoice 3 with future due date
    const { data: inv3 } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA1.id,
        invoice_number: 'INV-0003',
        issue_date: '2026-11-21',
        due_date: '2026-12-05',
        discount: 0,
        total_amount: 0,
      })
      .select('*')
      .single();

    await clientA.from('invoice_items').insert({
      business_id: bizA.id,
      invoice_id: inv3.id,
      description: 'Term 2 Foundation Module',
      quantity: 1,
      unit_price: 4000.00,
      total_price: 4000.00,
    });

    const { data: transResult, error: errTransRpc } = await clientA.rpc('transition_invoice_status', {
      p_invoice_id: inv3.id,
      p_new_status: 'sent',
    });

    if (!errTransRpc && transResult && transResult.status === 'sent' && transResult.previous_status === 'draft') {
      report(14, 'Valid Status Transition: draft -> sent', 'PASS', `INV-0003 transitioned draft -> sent via transition_invoice_status RPC`);
    } else {
      report(14, 'Valid Status Transition: draft -> sent', 'FAIL', `RPC error: ${errTransRpc?.message}, result: ${JSON.stringify(transResult)}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 15: Invalid Status Transition Rejection
    // ------------------------------------------------------------------------
    // Attempting to transition already-sent invoice to sent again
    const { error: errRepeatSent } = await clientA.rpc('transition_invoice_status', {
      p_invoice_id: inv3.id,
      p_new_status: 'sent',
    });

    // Attempting invalid status name
    const { error: errInvalidStatus } = await clientA.rpc('transition_invoice_status', {
      p_invoice_id: inv3.id,
      p_new_status: 'paid', // payment-driven status cannot be manually set
    });

    if (errRepeatSent && errInvalidStatus) {
      report(15, 'Invalid Status Transition Rejection', 'PASS', `Rejected duplicate transition (${errRepeatSent.message}); rejected manual 'paid' status`);
    } else {
      report(15, 'Invalid Status Transition Rejection', 'FAIL', `Repeat sent err: ${errRepeatSent?.message}, Invalid status err: ${errInvalidStatus?.message}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 16: History View Verification (v_invoices_history)
    // ------------------------------------------------------------------------
    const { data: historyData, error: errHistory } = await clientA
      .from('v_invoices_history')
      .select('*')
      .eq('business_id', bizA.id);

    const hasCalculatedFields = historyData && historyData.length > 0 &&
      historyData.every((r) => 'effective_status' in r && 'ageing_bucket' in r && 'is_archived_or_cancelled' in r);

    if (!errHistory && hasCalculatedFields) {
      report(16, 'History View Verification (v_invoices_history)', 'PASS', `View returned ${historyData.length} invoices with effective_status and ageing_bucket`);
    } else {
      report(16, 'History View Verification (v_invoices_history)', 'FAIL', `History error: ${errHistory?.message}, row count: ${historyData?.length}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 17: Effective View & Overdue Calculation (v_invoices_effective)
    // ------------------------------------------------------------------------
    // Create an invoice with due date 10 days in the past
    const { data: overdueInv } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA2.id,
        invoice_number: 'INV-OVERDUE-01',
        issue_date: '2026-11-01',
        due_date: '2026-11-10', // past date
        discount: 0,
        total_amount: 0,
      })
      .select('*')
      .single();

    await clientA.from('invoice_items').insert({
      business_id: bizA.id,
      invoice_id: overdueInv.id,
      description: 'Past Term Tuition Fee',
      quantity: 1,
      unit_price: 3500.00,
      total_price: 3500.00,
    });

    // Transition to sent - because due_date < current_date, resulting status is 'overdue'
    await clientA.rpc('transition_invoice_status', {
      p_invoice_id: overdueInv.id,
      p_new_status: 'sent',
    });

    const { data: effectiveOverdue, error: errEffective } = await clientA
      .from('v_invoices_effective')
      .select('*')
      .eq('id', overdueInv.id)
      .single();

    if (!errEffective && effectiveOverdue && effectiveOverdue.effective_status === 'overdue' && Number(effectiveOverdue.overdue_days) > 0) {
      report(17, 'Effective View & Overdue Ageing Calculation', 'PASS', `INV-OVERDUE-01 computed as 'overdue' (${effectiveOverdue.overdue_days} days overdue, bucket: ${effectiveOverdue.ageing_bucket})`);
    } else {
      report(17, 'Effective View & Overdue Ageing Calculation', 'FAIL', `Effective status: ${effectiveOverdue?.effective_status}, overdue_days: ${effectiveOverdue?.overdue_days}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 18: Soft Deletion via soft_delete_invoice() RPC
    // ------------------------------------------------------------------------
    // Create a draft invoice to soft-delete
    const { data: invToDelete } = await clientA
      .from('invoices')
      .insert({
        business_id: bizA.id,
        customer_id: studentA1.id,
        invoice_number: 'INV-SOFT-DEL',
        issue_date: '2026-11-21',
        due_date: '2026-11-28',
        total_amount: 0,
      })
      .select('*')
      .single();

    const { data: softDelResult, error: errSoftDel } = await clientA.rpc('soft_delete_invoice', {
      p_invoice_id: invToDelete.id,
    });

    // Verify it is excluded from v_invoices_effective
    const { data: excludedFromEffective } = await clientA
      .from('v_invoices_effective')
      .select('*')
      .eq('id', invToDelete.id);

    // Verify it is present in v_invoices_history with is_archived_or_cancelled = true
    const { data: inHistory } = await clientA
      .from('v_invoices_history')
      .select('*')
      .eq('id', invToDelete.id)
      .single();

    if (!errSoftDel && softDelResult?.success && excludedFromEffective?.length === 0 && inHistory?.is_archived_or_cancelled === true) {
      report(18, 'Soft Deletion via soft_delete_invoice() RPC', 'PASS', 'Invoice soft-deleted, status set to cancelled, excluded from effective view, preserved in history view');
    } else {
      report(18, 'Soft Deletion via soft_delete_invoice() RPC', 'FAIL', `Soft del err: ${errSoftDel?.message}, effective count: ${excludedFromEffective?.length}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 19: Persistence Integrity & Integer Paise Accounting
    // ------------------------------------------------------------------------
    // Fresh client query for Tenant A
    const freshClient = createUserClient(loginA.session.access_token);
    const { data: freshInv2, error: errFresh } = await freshClient
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', inv2Id)
      .single();

    const totalPaise = Math.round(Number(freshInv2?.total_amount) * 100);
    const subtotalPaise = Math.round(Number(freshInv2?.subtotal) * 100);
    const discountPaise = Math.round(Number(freshInv2?.discount) * 100);

    if (
      !errFresh &&
      freshInv2 &&
      freshInv2.invoice_items.length === 3 &&
      subtotalPaise === 750000 &&
      discountPaise === 50000 &&
      totalPaise === 700000
    ) {
      report(19, 'Persistence Integrity & Integer Paise Accounting', 'PASS', `₹7,000.00 verified as exactly 700,000 paise (subtotal: 750,000 - discount: 50,000) across fresh query`);
    } else {
      report(19, 'Persistence Integrity & Integer Paise Accounting', 'FAIL', `Fresh read failed or paise mismatch. Total paise: ${totalPaise}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 20: Customer Invoice History Query Matching customer_id
    // ------------------------------------------------------------------------
    const { data: studentA1Invoices, error: errStA1Invs } = await clientA
      .from('invoices')
      .select('*')
      .eq('customer_id', studentA1.id)
      .is('deleted_at', null);

    const { data: studentA2Invoices, error: errStA2Invs } = await clientA
      .from('invoices')
      .select('*')
      .eq('customer_id', studentA2.id)
      .is('deleted_at', null);

    const allA1Match = studentA1Invoices && studentA1Invoices.every((inv) => inv.customer_id === studentA1.id);
    const allA2Match = studentA2Invoices && studentA2Invoices.every((inv) => inv.customer_id === studentA2.id);

    if (!errStA1Invs && !errStA2Invs && allA1Match && allA2Match && studentA1Invoices.length > 0 && studentA2Invoices.length > 0) {
      report(20, 'Customer Invoice History Query Matching customer_id', 'PASS', `Student A1 returned ${studentA1Invoices.length} invoices; Student A2 returned ${studentA2Invoices.length} invoices`);
    } else {
      report(20, 'Customer Invoice History Query Matching customer_id', 'FAIL', `Student A1 count: ${studentA1Invoices?.length}, Student A2 count: ${studentA2Invoices?.length}`);
    }

  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Clean up test accounts and rows safely
    // ------------------------------------------------------------------------
    console.log('\nPhase 3: Cleaning up Ephemeral Test Identities...');
    if (userAId) {
      try {
        await adminClient.auth.admin.deleteUser(userAId);
        console.log(`  ✓ Cleaned up Tenant A (${userAId})`);
      } catch (e) {
        console.warn(`  ⚠ Warning: Failed to delete user A: ${e.message}`);
      }
    }
    if (userBId) {
      try {
        await adminClient.auth.admin.deleteUser(userBId);
        console.log(`  ✓ Cleaned up Tenant B (${userBId})`);
      } catch (e) {
        console.warn(`  ⚠ Warning: Failed to delete user B: ${e.message}`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('Invoice Management Integration Test Summary:');
  const passes = testResults.filter((r) => r.status === 'PASS').length;
  const fails = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`  Total: ${testResults.length} | Passed: ${passes} | Failed: ${fails}`);
  console.log('================================================================\n');

  if (fails > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled failure in invoice test suite:', err);
  process.exit(1);
});
