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
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('================================================================');
console.log('FeePulse Customer & Student Directory RLS Integration Test Suite');
console.log(`Target Staging Project: ${targetRef}`);
console.log('================================================================\n');

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const userAEmail = `test-cust-a-${nonce}@feepulse.internal`;
  const userBEmail = `test-cust-b-${nonce}@feepulse.internal`;
  const testPassword = `TestPass!${nonce}2026#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;
  let bizA = null;
  let bizB = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Provision Test Identifiers via Admin API
    // ------------------------------------------------------------------------
    console.log('Phase 1: Provisioning Ephemeral Test Tenants...');

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
    const { data: loginA, error: errLoginA } = await anonClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword,
    });
    if (errLoginA || !loginA.session) {
      throw new Error(`User A login failed: ${errLoginA?.message}`);
    }
    clientA = createUserClient(loginA.session.access_token);

    // Sign in as User B
    const { data: loginB, error: errLoginB } = await anonClient.auth.signInWithPassword({
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

    console.log(`  Tenant A ID: ${userAId} | Business A ID: ${bizA.id}`);
    console.log(`  Tenant B ID: ${userBId} | Business B ID: ${bizB.id}`);
    console.log('Provisioning complete.\n');

    // ------------------------------------------------------------------------
    // SCENARIO 1: Initial Clean State (No Sharma Academy sample data for new user)
    // ------------------------------------------------------------------------
    console.log('Phase 2: Executing Customer Integration Scenarios...');

    const { data: initialList, error: errInit } = await clientA
      .from('customers')
      .select('*')
      .eq('business_id', bizA.id);

    if (!errInit && initialList.length === 0) {
      report(1, 'New Tutor Initial Roster Clean State', 'PASS', '0 students returned, no demo pollution');
    } else {
      report(1, 'New Tutor Initial Roster Clean State', 'FAIL', `Expected 0, got ${initialList?.length}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 2: Customer Creation & Full Schema Persistence
    // ------------------------------------------------------------------------
    const student1Payload = {
      business_id: bizA.id,
      name: 'Aarav Sharma',
      parent_name: 'Vikram Sharma',
      grade_subject: 'Grade 10 CBSE Full Batch',
      phone: '+91 98201 54321',
      whatsapp_number: '+91 98201 54321',
      email: 'vikram.sharma@example.com',
      default_fee_amount: 7500.00,
      billing_cycle_day: 5,
      status: 'active',
      notes: 'Maths and Science batch enrollment',
    };

    const { data: createdStudent1, error: errCreate1 } = await clientA
      .from('customers')
      .insert(student1Payload)
      .select('*')
      .single();

    if (
      !errCreate1 &&
      createdStudent1 &&
      createdStudent1.name === 'Aarav Sharma' &&
      createdStudent1.business_id === bizA.id &&
      Number(createdStudent1.default_fee_amount) === 7500 &&
      createdStudent1.billing_cycle_day === 5 &&
      createdStudent1.status === 'active' &&
      createdStudent1.deleted_at === null
    ) {
      report(2, 'Customer Enrollment & Schema Persistence', 'PASS', `ID: ${createdStudent1.id}`);
    } else {
      report(2, 'Customer Enrollment & Schema Persistence', 'FAIL', errCreate1?.message || 'Field mismatch');
    }

    const student1Id = createdStudent1?.id;

    // ------------------------------------------------------------------------
    // SCENARIO 3: Database CHECK Constraints Validation
    // ------------------------------------------------------------------------
    // Negative fee
    const { error: errNegFee } = await clientA
      .from('customers')
      .insert({
        business_id: bizA.id,
        name: 'Negative Fee Test',
        phone: '9800000001',
        whatsapp_number: '9800000001',
        default_fee_amount: -500.00,
        billing_cycle_day: 1,
      });

    // Invalid cycle day
    const { error: errCycleDay } = await clientA
      .from('customers')
      .insert({
        business_id: bizA.id,
        name: 'Cycle Day Test',
        phone: '9800000002',
        whatsapp_number: '9800000002',
        default_fee_amount: 500.00,
        billing_cycle_day: 35,
      });

    // Null name
    const { error: errNullName } = await clientA
      .from('customers')
      .insert({
        business_id: bizA.id,
        phone: '9800000003',
        whatsapp_number: '9800000003',
        default_fee_amount: 500.00,
        billing_cycle_day: 1,
      });

    if (errNegFee && errCycleDay && errNullName) {
      report(3, 'PostgreSQL Schema Constraints Enforcement', 'PASS', 'Negative fees, invalid cycle days, null names rejected');
    } else {
      report(3, 'PostgreSQL Schema Constraints Enforcement', 'FAIL', 'Constraint violations were not rejected');
    }

    // ------------------------------------------------------------------------
    // SCENARIO 4: Multi-Student Enrollment & Search Filtering
    // ------------------------------------------------------------------------
    await clientA.from('customers').insert([
      {
        business_id: bizA.id,
        name: 'Bhavna Patel',
        parent_name: 'Nilesh Patel',
        grade_subject: 'Grade 11 Chemistry',
        phone: '+91 98111 22233',
        whatsapp_number: '+91 98111 22233',
        email: 'nilesh@patel.co.in',
        default_fee_amount: 6000.00,
        billing_cycle_day: 10,
        status: 'active',
      },
      {
        business_id: bizA.id,
        name: 'Chirag Gupta',
        parent_name: 'Sunil Gupta',
        grade_subject: 'Grade 12 IIT JEE Advanced',
        phone: '+91 98333 44455',
        whatsapp_number: '+91 98333 44455',
        email: 'sunil@gupta.org',
        default_fee_amount: 10000.00,
        billing_cycle_day: 15,
        status: 'active',
      },
    ]);

    // Search by student name
    const { data: searchName } = await clientA
      .from('customers')
      .select('*')
      .eq('business_id', bizA.id)
      .ilike('name', '%Bhavna%');

    // Search by parent name
    const { data: searchParent } = await clientA
      .from('customers')
      .select('*')
      .eq('business_id', bizA.id)
      .ilike('parent_name', '%Gupta%');

    // Search by phone
    const { data: searchPhone } = await clientA
      .from('customers')
      .select('*')
      .eq('business_id', bizA.id)
      .ilike('phone', '%98201%');

    if (
      searchName?.length === 1 &&
      searchName[0].name === 'Bhavna Patel' &&
      searchParent?.length === 1 &&
      searchParent[0].name === 'Chirag Gupta' &&
      searchPhone?.length === 1 &&
      searchPhone[0].name === 'Aarav Sharma'
    ) {
      report(4, 'Student Directory Search & Pattern Matching', 'PASS', 'Accurate matching on student name, parent name, phone');
    } else {
      report(4, 'Student Directory Search & Pattern Matching', 'FAIL', 'Search filtering results mismatch');
    }

    // ------------------------------------------------------------------------
    // SCENARIO 5: Customer Details Mutation & Timestamp Trigger
    // ------------------------------------------------------------------------
    const preUpdate = createdStudent1.updated_at;
    // Brief sleep to ensure timestamp advances
    await new Promise((r) => setTimeout(r, 50));

    const { data: updatedCust, error: errUpdate } = await clientA
      .from('customers')
      .update({
        default_fee_amount: 8500.00,
        notes: 'Upgraded to advanced batch with weekend labs',
      })
      .eq('id', student1Id)
      .eq('business_id', bizA.id)
      .select('*')
      .single();

    if (
      !errUpdate &&
      updatedCust &&
      Number(updatedCust.default_fee_amount) === 8500 &&
      updatedCust.notes.includes('weekend labs') &&
      updatedCust.updated_at > preUpdate
    ) {
      report(5, 'Customer Update & set_updated_at Trigger', 'PASS', `Fee ₹8,500, updated_at advanced`);
    } else {
      report(5, 'Customer Update & set_updated_at Trigger', 'FAIL', errUpdate?.message || 'Update failed');
    }

    // ------------------------------------------------------------------------
    // SCENARIO 6: Soft-Delete (Archival) & Active Query Filtering
    // ------------------------------------------------------------------------
    // Find Chirag's ID
    const chiragId = searchParent[0].id;
    const nowIso = new Date().toISOString();

    const { error: errArchive } = await clientA
      .from('customers')
      .update({
        deleted_at: nowIso,
        status: 'archived',
      })
      .eq('id', chiragId)
      .eq('business_id', bizA.id);

    // Active roster query (deleted_at IS NULL)
    const { data: activeStudents } = await clientA
      .from('customers')
      .select('*')
      .eq('business_id', bizA.id)
      .is('deleted_at', null);

    const hasChirag = activeStudents?.some((s) => s.id === chiragId);

    if (!errArchive && !hasChirag && activeStudents?.length === 2) {
      report(6, 'Soft-Delete (Archival) & Active Roster Exclusion', 'PASS', 'Archived student cleanly excluded from active roster');
    } else {
      report(6, 'Soft-Delete (Archival) & Active Roster Exclusion', 'FAIL', errArchive?.message || 'Archived student still present');
    }

    // ------------------------------------------------------------------------
    // SCENARIO 7: Soft-Delete Restoration Prevention Trigger
    // ------------------------------------------------------------------------
    // Attempting to clear deleted_at must trigger prevent_soft_delete_restoration()
    const { error: errRestore } = await clientA
      .from('customers')
      .update({
        deleted_at: null,
      })
      .eq('id', chiragId)
      .eq('business_id', bizA.id);

    if (errRestore && errRestore.message.includes('Restoring deleted records is not permitted')) {
      report(7, 'prevent_soft_delete_restoration Trigger Enforcement', 'PASS', 'PostgreSQL trigger prevented un-deletion');
    } else {
      report(7, 'prevent_soft_delete_restoration Trigger Enforcement', 'FAIL', `Expected restoration error, got: ${errRestore?.message || 'Success'}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 8: Physical DELETE Revocation
    // ------------------------------------------------------------------------
    // REVOKE DELETE ON TABLE public.customers FROM authenticated, anon, PUBLIC;
    const { error: errPhysicalDelete } = await clientA
      .from('customers')
      .delete()
      .eq('id', chiragId);

    if (errPhysicalDelete && (errPhysicalDelete.code === '42501' || errPhysicalDelete.message.toLowerCase().includes('permission denied'))) {
      report(8, 'Physical DELETE Revocation Enforcement', 'PASS', 'Direct SQL DELETE forbidden on customers table');
    } else {
      report(8, 'Physical DELETE Revocation Enforcement', 'FAIL', `Expected permission denied, got: ${errPhysicalDelete?.message || 'Allowed'}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 9: Multi-Tenant Isolation - Cross-Tenant Read Protection
    // ------------------------------------------------------------------------
    // Tenant B lists customers -> must see 0 (Tenant A has 3 students)
    const { data: tenantBList } = await clientB
      .from('customers')
      .select('*')
      .eq('business_id', bizB.id);

    // Tenant B attempts to select Tenant A's student by ID
    const { data: crossReadStudent } = await clientB
      .from('customers')
      .select('*')
      .eq('id', student1Id);

    // Tenant B creates their own student
    const { data: studentB } = await clientB
      .from('customers')
      .insert({
        business_id: bizB.id,
        name: 'Divya Nair',
        parent_name: 'Ramesh Nair',
        grade_subject: 'Grade 9 Foundation Science',
        phone: '+91 97777 88899',
        whatsapp_number: '+91 97777 88899',
        default_fee_amount: 5000.00,
        billing_cycle_day: 1,
      })
      .select('*')
      .single();

    // Tenant A queries all customers
    const { data: tenantAListAll } = await clientA
      .from('customers')
      .select('*');

    const tenantASeesDivya = tenantAListAll?.some((s) => s.id === studentB?.id);

    if (
      tenantBList?.length === 0 &&
      crossReadStudent?.length === 0 &&
      !tenantASeesDivya
    ) {
      report(9, 'Multi-Tenant Cross-Tenant Read Isolation', 'PASS', 'Tenant B cannot read Tenant A students; Tenant A cannot read Tenant B students');
    } else {
      report(9, 'Multi-Tenant Cross-Tenant Read Isolation', 'FAIL', 'Cross-tenant data leakage detected');
    }

    // ------------------------------------------------------------------------
    // SCENARIO 10: Multi-Tenant Isolation - Cross-Tenant Mutation & Spoofing
    // ------------------------------------------------------------------------
    // Tenant B attempts to UPDATE Tenant A's student
    const { data: maliciousUpdate } = await clientB
      .from('customers')
      .update({ name: 'Hacked Student Name' })
      .eq('id', student1Id)
      .select('*');

    // Tenant B attempts to INSERT customer claiming Tenant A's business_id
    const { error: spoofInsertErr } = await clientB
      .from('customers')
      .insert({
        business_id: bizA.id, // spoofing Tenant A's business_id
        name: 'Malicious Injected Student',
        phone: '+91 90000 00000',
        whatsapp_number: '+91 90000 00000',
        default_fee_amount: 1000.00,
        billing_cycle_day: 1,
      });

    if (
      (!maliciousUpdate || maliciousUpdate.length === 0) &&
      spoofInsertErr // RLS WITH CHECK (is_business_owner(business_id)) rejects
    ) {
      report(10, 'Multi-Tenant Cross-Tenant Write & Spoofing Defense', 'PASS', 'Cross-tenant mutation denied; business_id spoofing rejected by RLS');
    } else {
      report(10, 'Multi-Tenant Cross-Tenant Write & Spoofing Defense', 'FAIL', 'Cross-tenant mutation or spoofing succeeded');
    }

    // ------------------------------------------------------------------------
    // SCENARIO 11: Unauthenticated & Anonymous Request Rejection
    // ------------------------------------------------------------------------
    // Create an isolated unauthenticated client that has NEVER had signIn called
    const pureAnonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: anonRead, error: anonReadErr } = await pureAnonClient
      .from('customers')
      .select('*');

    const { error: anonInsertErr } = await pureAnonClient
      .from('customers')
      .insert({
        business_id: bizA.id,
        name: 'Anonymous Injected Student',
        phone: '+91 90000 00000',
        whatsapp_number: '+91 90000 00000',
        default_fee_amount: 1000.00,
        billing_cycle_day: 1,
      });

    const anonReadBlocked = Boolean(anonReadErr || !anonRead || anonRead.length === 0);
    const anonInsertBlocked = Boolean(anonInsertErr);

    if (anonReadBlocked && anonInsertBlocked) {
      report(11, 'Unauthenticated / Anonymous Access Denial', 'PASS', 'Anonymous queries denied/empty; anonymous writes rejected');
    } else {
      report(11, 'Unauthenticated / Anonymous Access Denial', 'FAIL', `Read blocked: ${anonReadBlocked}, Write blocked: ${anonInsertBlocked}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 12: Integrity & Integer Paise Accounting Verification
    // ------------------------------------------------------------------------
    // Verify fresh read of Tenant A's customer
    const { data: freshAarav } = await clientA
      .from('customers')
      .select('*')
      .eq('id', student1Id)
      .single();

    const feeAmount = Number(freshAarav?.default_fee_amount);
    const feePaise = Math.round(feeAmount * 100);

    if (freshAarav && feeAmount === 8500 && feePaise === 850000) {
      report(12, 'Persistence Integrity & Integer Paise Math', 'PASS', `Verified ₹8,500.00 is exactly 850,000 paise`);
    } else {
      report(12, 'Persistence Integrity & Integer Paise Math', 'FAIL', 'Database state or paise math failed');
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
  console.log('Customer Integration Test Summary:');
  const passes = testResults.filter((r) => r.status === 'PASS').length;
  const fails = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`  Total: ${testResults.length} | Passed: ${passes} | Failed: ${fails}`);
  console.log('================================================================\n');

  if (fails > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled failure in customer test suite:', err);
  process.exit(1);
});
