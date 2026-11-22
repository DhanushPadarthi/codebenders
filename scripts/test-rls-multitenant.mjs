import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load .env.local safely without exposing secrets
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

// Track results
const testResults = [];
function report(name, status, detail = '') {
  testResults.push({ name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  console.log(`  ${icon} [${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

// Helper: HTTP request wrapper for Supabase REST & Auth
async function apiRequest(endpoint, { method = 'GET', token = null, service = false, body = null, prefer = null, query = '' } = {}) {
  const url = `${SUPABASE_URL}${endpoint}${query ? (endpoint.includes('?') ? '&' : '?') + query : ''}`;
  const apiKey = service ? SERVICE_KEY : ANON_KEY;
  const authHeader = service ? `Bearer ${SERVICE_KEY}` : token ? `Bearer ${token}` : `Bearer ${ANON_KEY}`;

  const headers = {
    'apikey': apiKey,
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  };

  if (prefer) {
    headers['Prefer'] = prefer;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function runRLSTestSuite() {
  console.log('===============================================================');
  console.log(' FeePulse Multi-Tenant Supabase RLS Integration Test Suite     ');
  console.log(' Target: eyauiehyiipqkvfjecnx (PostgreSQL 17.12 Production)   ');
  console.log('===============================================================\n');

  // PHASE 2: PROVISION SYNTHETIC TEST IDENTITIES
  console.log('--- Phase 2: Provisioning Isolated Test Identities ---');
  const runId = Date.now().toString().slice(-6);
  const emailA = `feepulse.rls.test.a.${runId}@test.internal`;
  const emailB = `feepulse.rls.test.b.${runId}@test.internal`;
  const passA = `A-${crypto.randomUUID()}-!Aa9`;
  const passB = `B-${crypto.randomUUID()}-!Aa9`;

  // Provision User A via Admin API
  const createA = await apiRequest('/auth/v1/admin/users', {
    method: 'POST',
    service: true,
    body: {
      email: emailA,
      password: passA,
      email_confirm: true,
      user_metadata: { full_name: `FeePulse RLS Test A ${runId}` }
    }
  });

  if (!createA.ok || !createA.data?.id) {
    report('Provision Synthetic User A', 'FAIL', `Status ${createA.status}: ${JSON.stringify(createA.data)}`);
    process.exit(1);
  }
  const userA = createA.data;
  report('Provision Synthetic User A', 'PASS', `ID: ${userA.id.slice(0, 8)}...`);

  // Provision User B via Admin API
  const createB = await apiRequest('/auth/v1/admin/users', {
    method: 'POST',
    service: true,
    body: {
      email: emailB,
      password: passB,
      email_confirm: true,
      user_metadata: { full_name: `FeePulse RLS Test B ${runId}` }
    }
  });

  if (!createB.ok || !createB.data?.id) {
    report('Provision Synthetic User B', 'FAIL', `Status ${createB.status}: ${JSON.stringify(createB.data)}`);
    process.exit(1);
  }
  const userB = createB.data;
  report('Provision Synthetic User B', 'PASS', `ID: ${userB.id.slice(0, 8)}...`);

  // Authenticate User A
  const loginA = await apiRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: emailA, password: passA }
  });
  if (!loginA.ok || !loginA.data?.access_token) {
    report('Authenticate User A Client', 'FAIL', `Status ${loginA.status}`);
    process.exit(1);
  }
  const tokenA = loginA.data.access_token;
  report('Authenticate User A Client', 'PASS');

  // Authenticate User B
  const loginB = await apiRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: emailB, password: passB }
  });
  if (!loginB.ok || !loginB.data?.access_token) {
    report('Authenticate User B Client', 'FAIL', `Status ${loginB.status}`);
    process.exit(1);
  }
  const tokenB = loginB.data.access_token;
  report('Authenticate User B Client', 'PASS');

  // Verify handle_new_user() trigger created profiles, businesses, and settings
  const bizResA = await apiRequest('/rest/v1/businesses', {
    token: tokenA,
    query: `owner_id=eq.${userA.id}&select=*`
  });
  const bizA = Array.isArray(bizResA.data) ? bizResA.data[0] : null;
  if (!bizA?.id) {
    report('Verify User A Business Created by Trigger', 'FAIL', JSON.stringify(bizResA.data));
    process.exit(1);
  }
  report('Verify User A Business Created by Trigger', 'PASS', `Business ID: ${bizA.id.slice(0, 8)}...`);

  const bizResB = await apiRequest('/rest/v1/businesses', {
    token: tokenB,
    query: `owner_id=eq.${userB.id}&select=*`
  });
  const bizB = Array.isArray(bizResB.data) ? bizResB.data[0] : null;
  if (!bizB?.id) {
    report('Verify User B Business Created by Trigger', 'FAIL', JSON.stringify(bizResB.data));
    process.exit(1);
  }
  report('Verify User B Business Created by Trigger', 'PASS', `Business ID: ${bizB.id.slice(0, 8)}...`);

  if (bizA.id === bizB.id) {
    report('Distinct Multi-Tenant Boundaries', 'FAIL', 'Business IDs must not match');
    process.exit(1);
  }
  report('Distinct Multi-Tenant Boundaries', 'PASS', 'Two separate business entities established');

  // PHASE 3: CREATE SYNTHETIC FIXTURES ACROSS ALL 11 TABLES
  console.log('\n--- Phase 3: Constructing Isolated Synthetic Fixtures ---');

  // 1. Customers
  const custResA = await apiRequest('/rest/v1/customers', {
    method: 'POST',
    token: tokenA,
    prefer: 'return=representation',
    body: {
      business_id: bizA.id,
      name: `TEST_ONLY Student A ${runId}`,
      parent_name: 'Parent A',
      grade_subject: 'Class 10 Math',
      phone: '+919999900001',
      whatsapp_number: '+919999900001',
      default_fee_amount: 5000.00,
      billing_cycle_day: 1,
      status: 'active'
    }
  });
  const custA = Array.isArray(custResA.data) ? custResA.data[0] : null;
  report('Create Customer for Business A', custA?.id ? 'PASS' : 'FAIL');

  const custResB = await apiRequest('/rest/v1/customers', {
    method: 'POST',
    token: tokenB,
    prefer: 'return=representation',
    body: {
      business_id: bizB.id,
      name: `TEST_ONLY Student B ${runId}`,
      parent_name: 'Parent B',
      grade_subject: 'Class 12 Physics',
      phone: '+919999900002',
      whatsapp_number: '+919999900002',
      default_fee_amount: 7000.00,
      billing_cycle_day: 1,
      status: 'active'
    }
  });
  const custB = Array.isArray(custResB.data) ? custResB.data[0] : null;
  report('Create Customer for Business B', custB?.id ? 'PASS' : 'FAIL');

  // 2. Draft Invoices
  const invResA = await apiRequest('/rest/v1/invoices', {
    method: 'POST',
    token: tokenA,
    prefer: 'return=representation',
    body: {
      business_id: bizA.id,
      customer_id: custA.id,
      invoice_number: `INV-A-${runId}`,
      due_date: '2026-12-10',
      subtotal: 0.00,
      discount: 0.00,
      total_amount: 0.00,
      status: 'draft'
    }
  });
  const invA = Array.isArray(invResA.data) ? invResA.data[0] : null;
  report('Create Draft Invoice for Business A', invA?.id ? 'PASS' : 'FAIL');

  const invResB = await apiRequest('/rest/v1/invoices', {
    method: 'POST',
    token: tokenB,
    prefer: 'return=representation',
    body: {
      business_id: bizB.id,
      customer_id: custB.id,
      invoice_number: `INV-B-${runId}`,
      due_date: '2026-12-10',
      subtotal: 0.00,
      discount: 0.00,
      total_amount: 0.00,
      status: 'draft'
    }
  });
  const invB = Array.isArray(invResB.data) ? invResB.data[0] : null;
  report('Create Draft Invoice for Business B', invB?.id ? 'PASS' : 'FAIL');

  // 3. Invoice Items (while draft)
  const itemResA = await apiRequest('/rest/v1/invoice_items', {
    method: 'POST',
    token: tokenA,
    prefer: 'return=representation',
    body: {
      business_id: bizA.id,
      invoice_id: invA.id,
      description: 'Mathematics Monthly Tuition',
      quantity: 1,
      unit_price: 5000.00,
      total_price: 5000.00
    }
  });
  const itemA = Array.isArray(itemResA.data) ? itemResA.data[0] : null;
  report('Insert Line Item on Draft Invoice A', itemA?.id ? 'PASS' : 'FAIL', itemA?.id ? '' : JSON.stringify(itemResA.data));

  const itemResB = await apiRequest('/rest/v1/invoice_items', {
    method: 'POST',
    token: tokenB,
    prefer: 'return=representation',
    body: {
      business_id: bizB.id,
      invoice_id: invB.id,
      description: 'Physics Monthly Tuition',
      quantity: 1,
      unit_price: 7000.00,
      total_price: 7000.00
    }
  });
  const itemB = Array.isArray(itemResB.data) ? itemResB.data[0] : null;
  report('Insert Line Item on Draft Invoice B', itemB?.id ? 'PASS' : 'FAIL', itemB?.id ? '' : JSON.stringify(itemResB.data));

  // Verify recalculate trigger updated total_amount
  const checkInvA = await apiRequest('/rest/v1/invoices', {
    token: tokenA,
    query: `id=eq.${invA.id}&select=*`
  });
  const updatedInvA = checkInvA.data[0];
  const triggerRecalcOk = Number(updatedInvA?.total_amount) === 5000.00;
  report('Trigger Auto-Recalculation on Line Item Insertion', triggerRecalcOk ? 'PASS' : 'FAIL', `Total: ₹${updatedInvA?.total_amount}`);

  // Transition Invoice A to 'sent'
  const transResA = await apiRequest('/rest/v1/rpc/transition_invoice_status', {
    method: 'POST',
    token: tokenA,
    body: { p_invoice_id: invA.id, p_new_status: 'sent' }
  });
  report('Transition Invoice A from draft to sent', transResA.ok ? 'PASS' : 'FAIL');

  // Transition Invoice B to 'sent'
  const transResB = await apiRequest('/rest/v1/rpc/transition_invoice_status', {
    method: 'POST',
    token: tokenB,
    body: { p_invoice_id: invB.id, p_new_status: 'sent' }
  });
  report('Transition Invoice B from draft to sent', transResB.ok ? 'PASS' : 'FAIL');

  // 4. Bills
  const billResA = await apiRequest('/rest/v1/bills', {
    method: 'POST',
    token: tokenA,
    prefer: 'return=representation',
    body: {
      business_id: bizA.id,
      title: `TEST_ONLY Office Rent A ${runId}`,
      category: 'rent',
      amount: 2500.00,
      due_date: '2026-12-05',
      status: 'unpaid'
    }
  });
  const billA = Array.isArray(billResA.data) ? billResA.data[0] : null;
  report('Create Bill for Business A', billA?.id ? 'PASS' : 'FAIL');

  const billResB = await apiRequest('/rest/v1/bills', {
    method: 'POST',
    token: tokenB,
    prefer: 'return=representation',
    body: {
      business_id: bizB.id,
      title: `TEST_ONLY Electricity B ${runId}`,
      category: 'electricity',
      amount: 1200.00,
      due_date: '2026-12-05',
      status: 'unpaid'
    }
  });
  const billB = Array.isArray(billResB.data) ? billResB.data[0] : null;
  report('Create Bill for Business B', billB?.id ? 'PASS' : 'FAIL');

  // 5. Payment Promises
  const promResA = await apiRequest('/rest/v1/payment_promises', {
    method: 'POST',
    token: tokenA,
    prefer: 'return=representation',
    body: {
      business_id: bizA.id,
      customer_id: custA.id,
      invoice_id: invA.id,
      raw_message: 'Will transfer ₹2000 on Friday',
      promised_amount: 2000.00,
      promised_date: '2026-11-28',
      status: 'pending',
      confidence_score: 0.95
    }
  });
  const promA = Array.isArray(promResA.data) ? promResA.data[0] : null;
  report('Create Payment Promise for Business A', promA?.id ? 'PASS' : 'FAIL');

  const promResB = await apiRequest('/rest/v1/payment_promises', {
    method: 'POST',
    token: tokenB,
    prefer: 'return=representation',
    body: {
      business_id: bizB.id,
      customer_id: custB.id,
      invoice_id: invB.id,
      raw_message: 'Will pay ₹7000 by month end',
      promised_amount: 7000.00,
      promised_date: '2026-11-30',
      status: 'pending',
      confidence_score: 0.90
    }
  });
  const promB = Array.isArray(promResB.data) ? promResB.data[0] : null;
  report('Create Payment Promise for Business B', promB?.id ? 'PASS' : 'FAIL');

  // 6. Follow-Up Tasks
  const taskResA = await apiRequest('/rest/v1/follow_up_tasks', {
    method: 'POST',
    token: tokenA,
    prefer: 'return=representation',
    body: {
      business_id: bizA.id,
      customer_id: custA.id,
      invoice_id: invA.id,
      priority_score: 65.00,
      priority_level: 'medium',
      due_date: '2026-11-25',
      status: 'pending',
      last_reminder_tone: 'friendly'
    }
  });
  const taskA = Array.isArray(taskResA.data) ? taskResA.data[0] : null;
  report('Create Follow-Up Task for Business A', taskA?.id ? 'PASS' : 'FAIL');

  const taskResB = await apiRequest('/rest/v1/follow_up_tasks', {
    method: 'POST',
    token: tokenB,
    prefer: 'return=representation',
    body: {
      business_id: bizB.id,
      customer_id: custB.id,
      invoice_id: invB.id,
      priority_score: 85.00,
      priority_level: 'high',
      due_date: '2026-11-24',
      status: 'pending',
      last_reminder_tone: 'professional'
    }
  });
  const taskB = Array.isArray(taskResB.data) ? taskResB.data[0] : null;
  report('Create Follow-Up Task for Business B', taskB?.id ? 'PASS' : 'FAIL');

  // 7. Cashflow Scenarios
  const scenResA = await apiRequest('/rest/v1/cashflow_scenarios', {
    method: 'POST',
    token: tokenA,
    prefer: 'return=representation',
    body: {
      business_id: bizA.id,
      name: `TEST_ONLY Simulation A ${runId}`,
      parameters: { collection_delay_days: 10, batch_expansion: true }
    }
  });
  const scenA = Array.isArray(scenResA.data) ? scenResA.data[0] : null;
  report('Create Cashflow Scenario for Business A', scenA?.id ? 'PASS' : 'FAIL');

  const scenResB = await apiRequest('/rest/v1/cashflow_scenarios', {
    method: 'POST',
    token: tokenB,
    prefer: 'return=representation',
    body: {
      business_id: bizB.id,
      name: `TEST_ONLY Simulation B ${runId}`,
      parameters: { collection_delay_days: 15, expense_reduction: 1000 }
    }
  });
  const scenB = Array.isArray(scenResB.data) ? scenResB.data[0] : null;
  report('Create Cashflow Scenario for Business B', scenB?.id ? 'PASS' : 'FAIL');

  // PHASE 4: TENANT ISOLATION TESTS
  console.log('\n--- Phase 4: Validating Multi-Tenant Isolation & RLS ---');

  // A. OWN BUSINESS ACCESS (Client A & B verify access across all 11 tables)
  const tables = [
    { name: 'profiles', query: `id=eq.${userA.id}`, queryB: `id=eq.${userB.id}` },
    { name: 'businesses', query: `id=eq.${bizA.id}`, queryB: `id=eq.${bizB.id}` },
    { name: 'business_settings', query: `business_id=eq.${bizA.id}`, queryB: `business_id=eq.${bizB.id}` },
    { name: 'customers', query: `business_id=eq.${bizA.id}`, queryB: `business_id=eq.${bizB.id}` },
    { name: 'invoices', query: `business_id=eq.${bizA.id}`, queryB: `business_id=eq.${bizB.id}` },
    { name: 'invoice_items', query: `invoice_id=eq.${invA.id}`, queryB: `invoice_id=eq.${invB.id}` },
    { name: 'bills', query: `business_id=eq.${bizA.id}`, queryB: `business_id=eq.${bizB.id}` },
    { name: 'payment_promises', query: `business_id=eq.${bizA.id}`, queryB: `business_id=eq.${bizB.id}` },
    { name: 'follow_up_tasks', query: `business_id=eq.${bizA.id}`, queryB: `business_id=eq.${bizB.id}` },
    { name: 'cashflow_scenarios', query: `business_id=eq.${bizA.id}`, queryB: `business_id=eq.${bizB.id}` }
  ];

  for (const t of tables) {
    const resA = await apiRequest(`/rest/v1/${t.name}`, { token: tokenA, query: t.query });
    const countA = Array.isArray(resA.data) ? resA.data.length : 0;
    report(`Own Access: Client A reads ${t.name}`, countA > 0 ? 'PASS' : 'FAIL', `Found ${countA} records`);

    const resB = await apiRequest(`/rest/v1/${t.name}`, { token: tokenB, query: t.queryB });
    const countB = Array.isArray(resB.data) ? resB.data.length : 0;
    report(`Own Access: Client B reads ${t.name}`, countB > 0 ? 'PASS' : 'FAIL', `Found ${countB} records`);
  }

  // B. CROSS-BUSINESS READ PROTECTION
  console.log('\n--- Cross-Tenant Read Leakage Probing ---');
  for (const t of tables) {
    // Client A attempting to read Business B records
    const crossA = await apiRequest(`/rest/v1/${t.name}`, { token: tokenA, query: t.queryB });
    const countCrossA = Array.isArray(crossA.data) ? crossA.data.length : 0;
    report(`Cross-Read Block: Client A reading Business B's ${t.name}`, countCrossA === 0 ? 'PASS' : 'FAIL', `Returned ${countCrossA} rows (strictly 0 expected)`);

    // Client B attempting to read Business A records
    const crossB = await apiRequest(`/rest/v1/${t.name}`, { token: tokenB, query: t.query });
    const countCrossB = Array.isArray(crossB.data) ? crossB.data.length : 0;
    report(`Cross-Read Block: Client B reading Business A's ${t.name}`, countCrossB === 0 ? 'PASS' : 'FAIL', `Returned ${countCrossB} rows (strictly 0 expected)`);
  }

  // C. CROSS-BUSINESS WRITE PROTECTION
  console.log('\n--- Cross-Tenant Write Mutation Probing ---');
  // Client A attempting to insert customer for Business B
  const attackInsert = await apiRequest('/rest/v1/customers', {
    method: 'POST',
    token: tokenA,
    body: {
      business_id: bizB.id,
      name: 'MALICIOUS_INSERT_ATTEMPT',
      phone: '+919999999999',
      whatsapp_number: '+919999999999',
      status: 'active'
    }
  });
  const insertBlocked = !attackInsert.ok || attackInsert.status === 403 || attackInsert.status === 400 || (Array.isArray(attackInsert.data) && attackInsert.data.length === 0);
  report('Cross-Write Block: Client A inserting Customer into Business B', insertBlocked ? 'PASS' : 'FAIL', `Status: ${attackInsert.status}`);

  // Client A attempting to update Business B's customer
  const attackUpdate = await apiRequest('/rest/v1/customers', {
    method: 'PATCH',
    token: tokenA,
    query: `id=eq.${custB.id}`,
    prefer: 'return=representation',
    body: { name: 'MALICIOUS_MUTATION' }
  });
  const updateBlocked = Array.isArray(attackUpdate.data) ? attackUpdate.data.length === 0 : !attackUpdate.ok;
  report('Cross-Write Block: Client A updating Business B Customer', updateBlocked ? 'PASS' : 'FAIL', `Affected rows: ${Array.isArray(attackUpdate.data) ? attackUpdate.data.length : 0}`);

  // Client A attempting to delete Business B's bill
  const attackDelete = await apiRequest('/rest/v1/bills', {
    method: 'DELETE',
    token: tokenA,
    query: `id=eq.${billB.id}`,
    prefer: 'return=representation'
  });
  const deleteBlocked = Array.isArray(attackDelete.data) ? attackDelete.data.length === 0 : !attackDelete.ok;
  report('Cross-Write Block: Client A deleting Business B Bill', deleteBlocked ? 'PASS' : 'FAIL', `Affected rows: ${Array.isArray(attackDelete.data) ? attackDelete.data.length : 0}`);

  // Verify Business B records remained pristine
  const verifyB = await apiRequest('/rest/v1/customers', { token: tokenB, query: `id=eq.${custB.id}` });
  const custBUnmodified = verifyB.data?.[0]?.name === `TEST_ONLY Student B ${runId}`;
  report('Integrity Verification: Business B Data Unmodified by Attacks', custBUnmodified ? 'PASS' : 'FAIL');

  // D. INVOICE VIEW ISOLATION (Security Invoker Views)
  console.log('\n--- Security Invoker View Isolation Probing ---');
  const viewEffA = await apiRequest('/rest/v1/v_invoices_effective', { token: tokenA });
  const effRowsA = Array.isArray(viewEffA.data) ? viewEffA.data : [];
  const effAIsClean = effRowsA.every(row => row.business_id === bizA.id) && effRowsA.some(row => row.id === invA.id);
  report('View Isolation: Client A querying v_invoices_effective', effAIsClean ? 'PASS' : 'FAIL', `Contains only Biz A invoices (${effRowsA.length} total)`);

  const viewEffB = await apiRequest('/rest/v1/v_invoices_effective', { token: tokenB });
  const effRowsB = Array.isArray(viewEffB.data) ? viewEffB.data : [];
  const effBIsClean = effRowsB.every(row => row.business_id === bizB.id) && effRowsB.some(row => row.id === invB.id);
  report('View Isolation: Client B querying v_invoices_effective', effBIsClean ? 'PASS' : 'FAIL', `Contains only Biz B invoices (${effRowsB.length} total)`);

  const viewHistA = await apiRequest('/rest/v1/v_invoices_history', { token: tokenA });
  const histRowsA = Array.isArray(viewHistA.data) ? viewHistA.data : [];
  const histAIsClean = histRowsA.every(row => row.business_id === bizA.id);
  report('View Isolation: Client A querying v_invoices_history', histAIsClean ? 'PASS' : 'FAIL', `Contains only Biz A history (${histRowsA.length} total)`);

  // E. ANONYMOUS ACCESS REJECTION
  console.log('\n--- Anonymous Client Access Protection Probing ---');
  for (const table of ['customers', 'invoices', 'payments', 'bills', 'profiles', 'businesses']) {
    const anonRes = await apiRequest(`/rest/v1/${table}`, { token: null });
    const anonBlocked = !anonRes.ok || (Array.isArray(anonRes.data) && anonRes.data.length === 0);
    report(`Anon Protection: Anonymous client reading ${table}`, anonBlocked ? 'PASS' : 'FAIL', `Returned 0 rows / status: ${anonRes.status}`);
  }

  // PHASE 5: FINANCIAL RPC SECURITY TESTS
  console.log('\n--- Phase 5: Financial RPC Security & Stored Logic Probing ---');

  // 1. Client A records payment on own invoice
  const rpcPayLegit = await apiRequest('/rest/v1/rpc/record_invoice_payment', {
    method: 'POST',
    token: tokenA,
    body: {
      p_invoice_id: invA.id,
      p_amount: 2000.00,
      p_payment_mode: 'upi',
      p_reference_id: `UTR-${runId}-001`,
      p_notes: 'Legitimate partial fee settlement'
    }
  });
  report('Financial RPC: Client A records legitimate payment on own invoice', rpcPayLegit.ok ? 'PASS' : 'FAIL', JSON.stringify(rpcPayLegit.data));

  // Verify partial payment status update
  const invAfterPay1 = await apiRequest('/rest/v1/invoices', { token: tokenA, query: `id=eq.${invA.id}` });
  const inv1Data = invAfterPay1.data?.[0];
  const partialOk = Number(inv1Data?.amount_paid) === 2000.00 && Number(inv1Data?.balance_due) === 3000.00 && inv1Data?.status === 'partially_paid';
  report('Financial State: Partial payment updates balance and status correctly', partialOk ? 'PASS' : 'FAIL', `Paid: ₹${inv1Data?.amount_paid}, Balance: ₹${inv1Data?.balance_due}, Status: ${inv1Data?.status}`);

  // 2. Client A attempts payment on Business B's invoice (Cross-tenant attack)
  const rpcPayCross = await apiRequest('/rest/v1/rpc/record_invoice_payment', {
    method: 'POST',
    token: tokenA,
    body: {
      p_invoice_id: invB.id,
      p_amount: 1000.00
    }
  });
  const crossPayBlocked = !rpcPayCross.ok && (rpcPayCross.status === 400 || rpcPayCross.status === 403);
  report('Financial RPC Security: Client A recording payment on Business B invoice', crossPayBlocked ? 'PASS' : 'FAIL', `Rejected with status ${rpcPayCross.status}`);

  // 3. Overpayment rejection
  const rpcOverpay = await apiRequest('/rest/v1/rpc/record_invoice_payment', {
    method: 'POST',
    token: tokenA,
    body: {
      p_invoice_id: invA.id,
      p_amount: 50000.00 // Exceeds remaining ₹3,000 balance
    }
  });
  const overpayBlocked = !rpcOverpay.ok && rpcOverpay.status === 400;
  report('Financial Invariant: Overpayment strictly rejected', overpayBlocked ? 'PASS' : 'FAIL', `Rejected with status ${rpcOverpay.status}`);

  // 4. Settle full remaining balance
  const rpcPayFull = await apiRequest('/rest/v1/rpc/record_invoice_payment', {
    method: 'POST',
    token: tokenA,
    body: {
      p_invoice_id: invA.id,
      p_amount: 3000.00, // Settles exact ₹3,000 balance
      p_payment_mode: 'cash'
    }
  });
  report('Financial RPC: Settle exact remaining balance on Invoice A', rpcPayFull.ok ? 'PASS' : 'FAIL');

  const invAfterPayFull = await apiRequest('/rest/v1/invoices', { token: tokenA, query: `id=eq.${invA.id}` });
  const invFullData = invAfterPayFull.data?.[0];
  const fullPaidOk = Number(invFullData?.amount_paid) === 5000.00 && Number(invFullData?.balance_due) === 0.00 && invFullData?.status === 'paid';
  report('Financial State: Full payment transitions invoice to paid with ₹0 balance', fullPaidOk ? 'PASS' : 'FAIL', `Paid: ₹${invFullData?.amount_paid}, Balance: ₹${invFullData?.balance_due}, Status: ${invFullData?.status}`);

  // 5. Immutability trigger: attempting to add line item to finalized/paid invoice
  const attackAddItem = await apiRequest('/rest/v1/invoice_items', {
    method: 'POST',
    token: tokenA,
    body: {
      business_id: bizA.id,
      invoice_id: invA.id,
      description: 'Unauthorized Extra Charge',
      quantity: 1,
      unit_price: 1000.00,
      total_price: 1000.00
    }
  });
  const addItemBlocked = !attackAddItem.ok && (attackAddItem.status === 400 || attackAddItem.status === 403);
  report('Trigger Immutability: Adding line item to finalized invoice strictly rejected', addItemBlocked ? 'PASS' : 'FAIL', `Status: ${attackAddItem.status}`);

  // 6. Immutability trigger: attempting to directly mutate total on finalized invoice
  const attackMutateTotal = await apiRequest('/rest/v1/invoices', {
    method: 'PATCH',
    token: tokenA,
    query: `id=eq.${invA.id}`,
    body: { total_amount: 1000.00 }
  });
  const mutateTotalBlocked = !attackMutateTotal.ok && (attackMutateTotal.status === 400 || attackMutateTotal.status === 403);
  report('Trigger Immutability: Direct total_amount mutation on finalized invoice rejected', mutateTotalBlocked ? 'PASS' : 'FAIL', `Status: ${attackMutateTotal.status}`);

  // 7. Verify payments table isolation (payments table has SELECT-only policy for authenticated owner)
  const payReadA = await apiRequest('/rest/v1/payments', { token: tokenA });
  const payRowsA = Array.isArray(payReadA.data) ? payReadA.data : [];
  const paymentsOwnerOnly = payRowsA.length >= 2 && payRowsA.every(p => p.business_id === bizA.id);
  report('Own Access: Client A reads recorded payments in audit history', paymentsOwnerOnly ? 'PASS' : 'FAIL', `Found ${payRowsA.length} payments`);

  const payCrossB = await apiRequest('/rest/v1/payments', { token: tokenB, query: `business_id=eq.${bizA.id}` });
  const payCrossBBlocked = Array.isArray(payCrossB.data) && payCrossB.data.length === 0;
  report('Cross-Read Block: Client B reading Client A payments', payCrossBBlocked ? 'PASS' : 'FAIL', `Returned ${payCrossB.data?.length || 0} rows`);

  // SUMMARY & EXIT CODE
  console.log('\n===============================================================');
  const passCount = testResults.filter(r => r.status === 'PASS').length;
  const failCount = testResults.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL SCENARIOS EXECUTED: ${testResults.length}`);
  console.log(`PASSED: ${passCount}`);
  console.log(`FAILED: ${failCount}`);
  console.log('===============================================================');

  if (failCount > 0) {
    console.error(`\n✗ ${failCount} RLS or RPC security tests failed.`);
    process.exit(1);
  } else {
    console.log('\n✓ ALL MULTI-TENANT RLS AND FINANCIAL RPC SECURITY TESTS PASSED!');
    process.exit(0);
  }
}

runRLSTestSuite();
