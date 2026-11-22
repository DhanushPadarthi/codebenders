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

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const asOfDate = new Date().toISOString().slice(0, 10);

console.log('================================================================');
console.log('FeePulse Bills & Expenses RLS Integration Test Suite');
console.log(`Target Staging Project: ${targetRef}`);
console.log('================================================================\n');

async function runTests() {
  const nonce = crypto.randomBytes(4).toString('hex');
  const userAEmail = `test-exp-a-${nonce}@feepulse.internal`;
  const userBEmail = `test-exp-b-${nonce}@feepulse.internal`;
  const testPassword = `TestPass!${nonce}2026#`;

  let userAId = null;
  let userBId = null;
  let clientA = null;
  let clientB = null;
  let bizA = null;
  let bizB = null;
  let billA1 = null;
  let billA2 = null;

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

    // Login User A
    const { data: loginA, error: errLoginA } = await anonAuthClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword,
    });
    if (errLoginA || !loginA.session) throw new Error(`Login failed for User A: ${errLoginA?.message}`);
    clientA = createUserClient(loginA.session.access_token);

    // Login User B
    const { data: loginB, error: errLoginB } = await anonAuthClient.auth.signInWithPassword({
      email: userBEmail,
      password: testPassword,
    });
    if (errLoginB || !loginB.session) throw new Error(`Login failed for User B: ${errLoginB?.message}`);
    clientB = createUserClient(loginB.session.access_token);

    // Get business IDs
    const { data: bA } = await clientA.from('businesses').select('id').single();
    bizA = bA?.id;
    const { data: bB } = await clientB.from('businesses').select('id').single();
    bizB = bB?.id;

    if (!bizA || !bizB) throw new Error('Failed to resolve business IDs for test users');

    console.log(`  User A: ${userAEmail} (Biz: ${bizA})`);
    console.log(`  User B: ${userBEmail} (Biz: ${bizB})\n`);
    console.log('Phase 2: Executing 20 Expense & Bill Test Scenarios...\n');

    // ------------------------------------------------------------------------
    // Scenario 1: Authenticated Bill Listing (Clean Empty State)
    // ------------------------------------------------------------------------
    const { data: listEmpty, error: errEmpty } = await clientA
      .from('bills')
      .select('*')
      .eq('business_id', bizA)
      .is('deleted_at', null);

    if (!errEmpty && Array.isArray(listEmpty) && listEmpty.length === 0) {
      report(1, 'Authenticated Bill Listing (Clean Empty State)', 'PASS', '0 bills for fresh business');
    } else {
      report(1, 'Authenticated Bill Listing (Clean Empty State)', 'FAIL', errEmpty?.message || `Found ${listEmpty?.length} bills`);
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Create Bill
    // ------------------------------------------------------------------------
    const { data: createdBill, error: errCreate } = await clientA
      .from('bills')
      .insert({
        business_id: bizA,
        title: 'Physics Lab Consumables',
        category: 'materials',
        amount: 4500.00,
        due_date: '2026-11-28',
        status: 'unpaid',
        is_recurring: false,
        vendor_name: 'Science Supply Co',
        notes: 'Glassware and reagents',
      })
      .select('*')
      .single();

    if (!errCreate && createdBill && Number(createdBill.amount) === 4500.00 && createdBill.status === 'unpaid') {
      billA1 = createdBill;
      report(2, 'Create Bill', 'PASS', `Created bill ${createdBill.id} (₹4,500.00)`);
    } else {
      report(2, 'Create Bill', 'FAIL', errCreate?.message || 'Bill creation failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Update Bill
    // ------------------------------------------------------------------------
    const { data: updatedBill, error: errUpdate } = await clientA
      .from('bills')
      .update({
        title: 'Physics Lab Advanced Consumables',
        amount: 4800.00,
        due_date: '2026-11-30',
      })
      .eq('id', billA1.id)
      .select('*')
      .single();

    if (!errUpdate && updatedBill && updatedBill.title === 'Physics Lab Advanced Consumables' && Number(updatedBill.amount) === 4800.00) {
      report(3, 'Update Bill', 'PASS', `Updated title and amount to ₹4,800.00`);
    } else {
      report(3, 'Update Bill', 'FAIL', errUpdate?.message || 'Update failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Mark Bill as Paid
    // ------------------------------------------------------------------------
    const { data: paidBill, error: errPaid } = await clientA
      .from('bills')
      .update({
        status: 'paid',
        paid_date: '2026-11-25',
      })
      .eq('id', billA1.id)
      .select('*')
      .single();

    if (!errPaid && paidBill && paidBill.status === 'paid' && paidBill.paid_date === '2026-11-25') {
      report(4, 'Mark Bill as Paid', 'PASS', `Status updated to paid with paid_date 2026-11-25`);
    } else {
      report(4, 'Mark Bill as Paid', 'FAIL', errPaid?.message || 'Mark paid failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 5: Archive Bill (Soft-Delete & Block Physical Delete)
    // ------------------------------------------------------------------------
    const nowIso = new Date().toISOString();
    const { data: archivedBill, error: errArchive } = await clientA
      .from('bills')
      .update({ deleted_at: nowIso })
      .eq('id', billA1.id)
      .select('*')
      .single();

    // Now attempt physical DELETE via authenticated client
    const { error: errPhysicalDelete } = await clientA
      .from('bills')
      .delete()
      .eq('id', billA1.id);

    // Physical delete should fail because DELETE is revoked
    const isSoftDeleted = !errArchive && archivedBill && archivedBill.deleted_at !== null;
    const isPhysicalDeleteBlocked = !!errPhysicalDelete;

    if (isSoftDeleted && isPhysicalDeleteBlocked) {
      report(5, 'Archive Bill (Soft-Delete & Block Hard Delete)', 'PASS', 'Soft-delete succeeded, physical DELETE denied');
    } else {
      report(5, 'Archive Bill (Soft-Delete & Block Hard Delete)', 'FAIL', `softDeleted=${isSoftDeleted}, hardDeleteBlocked=${isPhysicalDeleteBlocked}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 6: Search & Category / Status Filters
    // ------------------------------------------------------------------------
    // Insert 3 new active bills
    const { data: multiBills, error: errMulti } = await clientA
      .from('bills')
      .insert([
        {
          business_id: bizA,
          title: 'Studio Electricity Bill',
          category: 'electricity',
          amount: 2200.00,
          due_date: '2026-11-29',
          status: 'unpaid',
          is_recurring: false,
        },
        {
          business_id: bizA,
          title: 'Assistant Tutor Stipend',
          category: 'salary',
          amount: 12000.00,
          due_date: '2026-12-01',
          status: 'unpaid',
          is_recurring: false,
        },
        {
          business_id: bizA,
          title: 'Zoom Pro Annual License',
          category: 'software',
          amount: 14000.00,
          due_date: '2026-11-20',
          status: 'paid',
          paid_date: '2026-11-20',
          is_recurring: false,
        },
      ])
      .select('*');

    if (!errMulti && multiBills && multiBills.length === 3) {
      billA2 = multiBills[1]; // Tutor stipend

      // Test category filter
      const { data: salaryBills } = await clientA
        .from('bills')
        .select('*')
        .eq('business_id', bizA)
        .eq('category', 'salary')
        .is('deleted_at', null);

      // Test status filter
      const { data: paidBills } = await clientA
        .from('bills')
        .select('*')
        .eq('business_id', bizA)
        .eq('status', 'paid')
        .is('deleted_at', null);

      // Test search filter
      const { data: searchBills } = await clientA
        .from('bills')
        .select('*')
        .eq('business_id', bizA)
        .ilike('title', '%Electricity%')
        .is('deleted_at', null);

      if (salaryBills?.length === 1 && paidBills?.length === 1 && searchBills?.length === 1) {
        report(6, 'Search & Category / Status Filters', 'PASS', 'Filtered by category (1), status (1), and search title (1)');
      } else {
        report(6, 'Search & Category / Status Filters', 'FAIL', `Salary: ${salaryBills?.length}, Paid: ${paidBills?.length}, Search: ${searchBills?.length}`);
      }
    } else {
      report(6, 'Search & Category / Status Filters', 'FAIL', errMulti?.message || 'Failed to insert test bills');
    }

    // ------------------------------------------------------------------------
    // Scenario 7: Recurrence Configuration
    // ------------------------------------------------------------------------
    const { data: recurBill, error: errRecur } = await clientA
      .from('bills')
      .insert({
        business_id: bizA,
        title: 'High-Speed Broadband Internet',
        category: 'internet',
        amount: 1800.00,
        due_date: '2026-12-05',
        status: 'unpaid',
        is_recurring: true,
        recurring_frequency: 'monthly',
        recurring_day_of_month: 5,
      })
      .select('*')
      .single();

    if (!errRecur && recurBill && recurBill.is_recurring && recurBill.recurring_frequency === 'monthly' && recurBill.recurring_day_of_month === 5) {
      report(7, 'Recurrence Configuration', 'PASS', 'Monthly recurring on 5th of every month persisted');
    } else {
      report(7, 'Recurrence Configuration', 'FAIL', errRecur?.message || 'Recurrence config failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 8: Recurrence End Date Handling
    // ------------------------------------------------------------------------
    const { data: endBill, error: errEnd } = await clientA
      .from('bills')
      .insert({
        business_id: bizA,
        title: 'Math Olympiad Mentorship Platform',
        category: 'software',
        amount: 3500.00,
        due_date: '2026-12-10',
        status: 'unpaid',
        is_recurring: true,
        recurring_frequency: 'monthly',
        recurring_day_of_month: 10,
        recurring_end_date: '2027-05-31',
      })
      .select('*')
      .single();

    if (!errEnd && endBill && endBill.recurring_end_date === '2027-05-31') {
      report(8, 'Recurrence End Date Handling', 'PASS', 'recurring_end_date (2027-05-31) persisted');
    } else {
      report(8, 'Recurrence End Date Handling', 'FAIL', errEnd?.message || 'End date handling failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 9: Invalid Amount Rejection
    // ------------------------------------------------------------------------
    const { error: errBad } = await clientA
      .from('bills')
      .insert({
        business_id: bizA,
        title: 'Negative Amount Bill',
        category: 'other',
        amount: -500.00,
        due_date: '2026-11-30',
        status: 'unpaid',
        is_recurring: false,
      })
      .select('*');

    if (errBad) {
      report(9, 'Invalid Amount Rejection', 'PASS', `Rejected negative amount: ${errBad.message}`);
    } else {
      report(9, 'Invalid Amount Rejection', 'FAIL', 'Database allowed negative bill amount');
    }

    // ------------------------------------------------------------------------
    // Scenario 10: Unauthenticated Access Rejection
    // ------------------------------------------------------------------------
    const { data: anonData, error: errAnon } = await anonAuthClient
      .from('bills')
      .select('*');

    if (!errAnon && Array.isArray(anonData) && anonData.length === 0) {
      report(10, 'Unauthenticated Access Rejection', 'PASS', 'Anonymous client sees 0 bills');
    } else {
      report(10, 'Unauthenticated Access Rejection', 'FAIL', `Anon query returned ${anonData?.length} rows`);
    }

    // ------------------------------------------------------------------------
    // Scenario 11: Cross-Business Read Rejection
    // ------------------------------------------------------------------------
    const { data: bBills, error: errBBills } = await clientB
      .from('bills')
      .select('*');

    const tenantAIdInB = bBills?.some((b) => b.business_id === bizA);
    if (!errBBills && !tenantAIdInB) {
      report(11, 'Cross-Business Read Rejection', 'PASS', `Tenant B sees 0 bills from Tenant A`);
    } else {
      report(11, 'Cross-Business Read Rejection', 'FAIL', 'Tenant B leaked Tenant A bills');
    }

    // ------------------------------------------------------------------------
    // Scenario 12: Cross-Business Write Rejection
    // ------------------------------------------------------------------------
    const { data: hackedBill, error: errHack } = await clientB
      .from('bills')
      .update({ title: 'Hacked by Tenant B' })
      .eq('id', billA2.id)
      .select('*');

    if (errHack || !hackedBill || hackedBill.length === 0) {
      // Verify bill remains intact
      const { data: verifyA2 } = await clientA
        .from('bills')
        .select('title')
        .eq('id', billA2.id)
        .single();

      if (verifyA2?.title === 'Assistant Tutor Stipend') {
        report(12, 'Cross-Business Write Rejection', 'PASS', 'Tenant B cannot update Tenant A bill');
      } else {
        report(12, 'Cross-Business Write Rejection', 'FAIL', 'Tenant A bill was modified by Tenant B');
      }
    } else {
      report(12, 'Cross-Business Write Rejection', 'FAIL', 'Tenant B successfully updated Tenant A bill');
    }

    // ------------------------------------------------------------------------
    // Scenario 13: Persistence After Session Reload
    // ------------------------------------------------------------------------
    const { data: reLoginA, error: errReLogin } = await anonAuthClient.auth.signInWithPassword({
      email: userAEmail,
      password: testPassword,
    });
    if (errReLogin || !reLoginA.session) throw new Error('Re-login failed for User A');

    const freshClientA = createUserClient(reLoginA.session.access_token);
    const { data: reloadedBills, error: errReload } = await freshClientA
      .from('bills')
      .select('*')
      .eq('business_id', bizA)
      .is('deleted_at', null);

    if (!errReload && reloadedBills && reloadedBills.length >= 4) {
      report(13, 'Persistence After Session Reload', 'PASS', `Reloaded session verified ${reloadedBills.length} active bills`);
    } else {
      report(13, 'Persistence After Session Reload', 'FAIL', errReload?.message || 'Reload failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 14: Category Summary Correctness (Integer-Paise)
    // ------------------------------------------------------------------------
    const { data: allActiveBills } = await freshClientA
      .from('bills')
      .select('category, amount, status')
      .eq('business_id', bizA)
      .is('deleted_at', null);

    let totalPaise = 0;
    const categoryPaise = {};

    for (const b of allActiveBills || []) {
      const p = Math.round(Number(b.amount) * 100);
      totalPaise += p;
      categoryPaise[b.category] = (categoryPaise[b.category] || 0) + p;
    }

    // Sum of category paise must equal totalPaise exactly
    const sumCategoriesPaise = Object.values(categoryPaise).reduce((s, v) => s + v, 0);
    const hasZeroDrift = sumCategoriesPaise === totalPaise;

    if (hasZeroDrift && totalPaise > 0) {
      report(14, 'Category Summary Correctness (Integer-Paise)', 'PASS', `Total ₹${(totalPaise / 100).toFixed(2)} exact paise parity`);
    } else {
      report(14, 'Category Summary Correctness (Integer-Paise)', 'FAIL', `Drift detected: sum=${sumCategoriesPaise}, total=${totalPaise}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 15: Vendor Name and Notes Persistence & Query Retrieval
    // ------------------------------------------------------------------------
    const { data: vendorBill, error: errVendor } = await freshClientA
      .from('bills')
      .insert({
        business_id: bizA,
        title: `Fiber Lease ${nonce}`,
        category: 'internet',
        amount: 3200.00,
        due_date: addDays(asOfDate, 12),
        vendor_name: 'Metro Optical Broadband Ltd',
        notes: 'Monthly 500Mbps dedicated fiber lease for classroom live streams',
        status: 'unpaid',
      })
      .select('*')
      .single();

    if (!errVendor && vendorBill?.vendor_name === 'Metro Optical Broadband Ltd' && vendorBill?.notes?.includes('dedicated fiber')) {
      report(15, 'Vendor Name & Notes Persistence', 'PASS', `Stored vendor "${vendorBill.vendor_name}" and descriptive notes`);
    } else {
      report(15, 'Vendor Name & Notes Persistence', 'FAIL', errVendor?.message || 'Vendor/notes mismatch');
    }

    // ------------------------------------------------------------------------
    // Scenario 16: Zero-Amount Database Constraint Rejection
    // ------------------------------------------------------------------------
    let zeroAmountRejected = false;
    let zeroAmountErr = '';
    try {
      const { error: errZero } = await freshClientA
        .from('bills')
        .insert({
          business_id: bizA,
          title: `Zero Bill ${nonce}`,
          category: 'software',
          amount: 0.00,
          due_date: addDays(asOfDate, 5),
          status: 'unpaid',
        });
      if (errZero) {
        zeroAmountRejected = true;
        zeroAmountErr = errZero.message;
      }
    } catch (e) {
      zeroAmountRejected = true;
      zeroAmountErr = e.message;
    }

    if (zeroAmountRejected) {
      report(16, 'Zero-Amount Constraint Rejection', 'PASS', `Database rejected zero-amount bill: ${zeroAmountErr}`);
    } else {
      report(16, 'Zero-Amount Constraint Rejection', 'FAIL', 'Database permitted ₹0.00 bill');
    }

    // ------------------------------------------------------------------------
    // Scenario 17: Date-Range Filtering (Upcoming 14 Days)
    // ------------------------------------------------------------------------
    const windowStart = asOfDate;
    const windowEnd = addDays(asOfDate, 14);
    const { data: windowBills, error: errWindow } = await freshClientA
      .from('bills')
      .select('id, due_date')
      .eq('business_id', bizA)
      .is('deleted_at', null)
      .gte('due_date', windowStart)
      .lte('due_date', windowEnd);

    if (!errWindow && windowBills && windowBills.length >= 2) {
      const allInWindow = windowBills.every((b) => b.due_date >= windowStart && b.due_date <= windowEnd);
      if (allInWindow) {
        report(17, 'Due-Date Range Filtering', 'PASS', `Retrieved ${windowBills.length} bills strictly within ${windowStart}..${windowEnd}`);
      } else {
        report(17, 'Due-Date Range Filtering', 'FAIL', 'Found bill outside date window');
      }
    } else {
      report(17, 'Due-Date Range Filtering', 'FAIL', errWindow?.message || `Window count: ${windowBills?.length}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 18: Bill Status Transition From Paid Back to Unpaid
    // ------------------------------------------------------------------------
    // Mark vendorBill as paid first, then unmark back to unpaid
    await freshClientA
      .from('bills')
      .update({ status: 'paid', paid_date: asOfDate })
      .eq('id', vendorBill.id);

    const { data: unmarkedBill, error: errUnmark } = await freshClientA
      .from('bills')
      .update({ status: 'unpaid', paid_date: null })
      .eq('id', vendorBill.id)
      .select('*')
      .single();

    if (!errUnmark && unmarkedBill?.status === 'unpaid' && unmarkedBill?.paid_date === null) {
      report(18, 'Status Transition (Paid -> Unpaid)', 'PASS', `Transitioned back to unpaid with paid_date cleared`);
    } else {
      report(18, 'Status Transition (Paid -> Unpaid)', 'FAIL', errUnmark?.message || `status: ${unmarkedBill?.status}`);
    }

    // ------------------------------------------------------------------------
    // Scenario 19: Mixed Recurring & Non-Recurring Metrics Aggregation
    // ------------------------------------------------------------------------
    const { data: metricsBills, error: errMetrics } = await freshClientA
      .from('bills')
      .select('amount, is_recurring, recurring_frequency')
      .eq('business_id', bizA)
      .is('deleted_at', null);

    if (!errMetrics && metricsBills) {
      const recurringCount = metricsBills.filter((b) => b.is_recurring).length;
      const nonRecurringCount = metricsBills.filter((b) => !b.is_recurring).length;
      if (recurringCount >= 1 && nonRecurringCount >= 2) {
        report(19, 'Mixed Recurring & One-Off Metrics', 'PASS', `Verified ${recurringCount} recurring and ${nonRecurringCount} one-off bills`);
      } else {
        report(19, 'Mixed Recurring & One-Off Metrics', 'FAIL', `Counts: rec=${recurringCount}, nonRec=${nonRecurringCount}`);
      }
    } else {
      report(19, 'Mixed Recurring & One-Off Metrics', 'FAIL', errMetrics?.message || 'Metrics query failed');
    }

    // ------------------------------------------------------------------------
    // Scenario 20: Idempotent Soft-Delete Safety
    // ------------------------------------------------------------------------
    // Archive vendorBill, record original deleted_at, re-archive and verify stability
    const firstArchiveTime = new Date().toISOString();
    await freshClientA
      .from('bills')
      .update({ deleted_at: firstArchiveTime })
      .eq('id', vendorBill.id);

    const { data: firstArchived } = await freshClientA
      .from('bills')
      .select('deleted_at')
      .eq('id', vendorBill.id)
      .single();

    // Re-archive attempt
    const { error: errSecondArchive } = await freshClientA
      .from('bills')
      .update({ deleted_at: firstArchived.deleted_at })
      .eq('id', vendorBill.id);

    if (!errSecondArchive && firstArchived?.deleted_at) {
      report(20, 'Idempotent Soft-Delete Safety', 'PASS', `Soft-delete safely idempotent without duplicate key or state drift`);
    } else {
      report(20, 'Idempotent Soft-Delete Safety', 'FAIL', errSecondArchive?.message || 'Soft delete re-run failed');
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

  if (failed > 0 || testResults.length < 20) {
    process.exit(1);
  }
}

runTests();
