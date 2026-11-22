/**
 * Test Suite: FeePulse Smart Recovery Queue & Priority Scoring Engine
 * 
 * Verifies 8 core recovery and prioritization scenarios:
 * 1. Overdue day ranking (longer overdue = higher priority)
 * 2. Outstanding amount influence (larger amount = higher priority)
 * 3. Broken promise priority escalation
 * 4. Upcoming future promise handling (grace period discount)
 * 5. Duplicate customer aggregation (multiple invoices merged into one profile)
 * 6. Follow-up state updates & recency adjustments
 * 7. Exclusion of paid, draft, and cancelled invoices
 * 8. Zero-mutation guarantee of original financial records
 */

import assert from "node:assert/strict";

// Dynamic import of TS module using experimental strip types
const {
  scoreCustomerRecovery,
  buildRecoveryQueue,
  computeRecoveryStats,
  generateReminderDrafts,
} = await import("../lib/finance/recovery-scoring.ts");

console.log("=== Running FeePulse Smart Recovery Queue Test Suite ===\n");

// Helper mock data factory
function createMockCustomer(overrides = {}) {
  return {
    id: "cust-mock-1",
    name: "Arjun Verma",
    parentName: "Ramesh Verma",
    gradeSubject: "Grade 10 CBSE",
    phone: "+91 98765 43210",
    whatsappNumber: "+91 98765 43210",
    defaultFeeAmount: 8500,
    billingCycleDay: 10,
    status: "active",
    totalInvoiced: 25500,
    totalCollected: 17000,
    outstandingBalance: 8500,
    nextPaymentDate: "2026-11-07",
    overdueCount: 1,
    joinedDate: "2026-05-10",
    ...overrides,
  };
}

function createMockInvoice(overrides = {}) {
  return {
    id: "inv-mock-1",
    customerId: "cust-mock-1",
    invoiceNumber: "INV-2026-001",
    customerName: "Arjun Verma",
    customerGrade: "Grade 10 CBSE",
    parentPhone: "+91 98765 43210",
    parentName: "Ramesh Verma",
    issueDate: "2026-10-28",
    dueDate: "2026-11-07",
    subtotal: 8500,
    discount: 0,
    totalAmount: 8500,
    amountPaid: 0,
    balanceDue: 8500,
    status: "overdue",
    items: [{ id: "item-1", description: "Tuition", quantity: 1, unitPrice: 8500, totalPrice: 8500 }],
    ...overrides,
  };
}

function createMockPromise(overrides = {}) {
  return {
    id: "prm-mock-1",
    customerId: "cust-mock-1",
    invoiceId: "inv-mock-1",
    rawMessage: "Will pay via UPI by Friday",
    promisedAmount: 8500,
    promisedDate: "2026-11-15",
    status: "broken",
    confidenceScore: 0.75,
    ...overrides,
  };
}

// -------------------------------------------------------------
// Test 1: Overdue Day Ranking
// -------------------------------------------------------------
console.log("Test 1: Overdue day ranking (longer overdue = higher score)...");
{
  const inv14d = createMockInvoice({
    dueDate: "2026-11-07", // 14 days overdue as of 2026-11-21
    balanceDue: 8000,
  });
  const inv4d = createMockInvoice({
    dueDate: "2026-11-17", // 4 days overdue as of 2026-11-21
    balanceDue: 8000,
  });

  const res14d = scoreCustomerRecovery(
    "cust-1", "Student A", "Parent A", "+91 98000 00001", "+91 98000 00001", "Class 10",
    [inv14d], [], [], "2026-11-21"
  );
  const res4d = scoreCustomerRecovery(
    "cust-2", "Student B", "Parent B", "+91 98000 00002", "+91 98000 00002", "Class 10",
    [inv4d], [], [], "2026-11-21"
  );

  assert.ok(
    res14d.priorityScore > res4d.priorityScore,
    `Customer with 14 overdue days (score: ${res14d.priorityScore}) must rank higher than 4 days (score: ${res4d.priorityScore})`
  );
  assert.equal(res14d.maxOverdueDays, 14);
  assert.equal(res4d.maxOverdueDays, 4);
  console.log(`  ✓ Passed: 14d overdue (Score: ${res14d.priorityScore}) ranked strictly above 4d overdue (Score: ${res4d.priorityScore}).`);
}

// -------------------------------------------------------------
// Test 2: Outstanding Amount Influence
// -------------------------------------------------------------
console.log("\nTest 2: Outstanding amount influence (higher amount = higher score)...");
{
  const invLarge = createMockInvoice({
    dueDate: "2026-11-11", // 10 days overdue
    balanceDue: 15000,
  });
  const invSmall = createMockInvoice({
    dueDate: "2026-11-11", // 10 days overdue
    balanceDue: 3000,
  });

  const resLarge = scoreCustomerRecovery(
    "cust-1", "Student A", "Parent A", "+91 98000 00001", "+91 98000 00001", "Class 10",
    [invLarge], [], [], "2026-11-21"
  );
  const resSmall = scoreCustomerRecovery(
    "cust-2", "Student B", "Parent B", "+91 98000 00002", "+91 98000 00002", "Class 10",
    [invSmall], [], [], "2026-11-21"
  );

  assert.ok(
    resLarge.priorityScore > resSmall.priorityScore,
    `Invoice of ₹15,000 (score: ${resLarge.priorityScore}) must rank higher than ₹3,000 (score: ${resSmall.priorityScore})`
  );
  console.log(`  ✓ Passed: ₹15,000 balance (Score: ${resLarge.priorityScore}) ranked strictly above ₹3,000 (Score: ${resSmall.priorityScore}).`);
}

// -------------------------------------------------------------
// Test 3: Broken Promise Priority Escalation
// -------------------------------------------------------------
console.log("\nTest 3: Broken promise priority escalation...");
{
  const inv = createMockInvoice({
    id: "inv-broken",
    dueDate: "2026-11-07",
    balanceDue: 8500,
  });
  const brokenPromise = createMockPromise({
    invoiceId: "inv-broken",
    status: "broken",
    promisedDate: "2026-11-15",
  });

  const resWithBroken = scoreCustomerRecovery(
    "cust-1", "Arjun Verma", "Ramesh Verma", "+91 98765 43210", "+91 98765 43210", "Grade 10",
    [inv], [brokenPromise], [], "2026-11-21"
  );
  const resWithoutPromise = scoreCustomerRecovery(
    "cust-1", "Arjun Verma", "Ramesh Verma", "+91 98765 43210", "+91 98765 43210", "Grade 10",
    [inv], [], [], "2026-11-21"
  );

  assert.ok(
    resWithBroken.priorityScore >= 75,
    `Broken promise must escalate customer to Urgent (score: ${resWithBroken.priorityScore})`
  );
  assert.equal(resWithBroken.priorityCategory, "Urgent");
  assert.equal(resWithBroken.recommendedTone, "firm");
  assert.ok(
    resWithBroken.priorityScore - resWithoutPromise.priorityScore >= 30,
    "Broken promise must add significant escalation weight"
  );
  console.log(`  ✓ Passed: Broken promise escalated score to ${resWithBroken.priorityScore} (Category: Urgent, Tone: firm).`);
}

// -------------------------------------------------------------
// Test 4: Upcoming Future Promise Handling
// -------------------------------------------------------------
console.log("\nTest 4: Upcoming future promise handling (grace discount)...");
{
  const inv = createMockInvoice({
    dueDate: "2026-11-15", // 6 days overdue
    balanceDue: 7500,
  });
  const futurePromise = createMockPromise({
    status: "pending",
    promisedDate: "2026-11-25", // Promise in 4 days
  });

  const resWithPromise = scoreCustomerRecovery(
    "cust-1", "Student A", "Parent A", "+91 98000 00001", "+91 98000 00001", "Class 10",
    [inv], [futurePromise], [], "2026-11-21"
  );
  const resWithoutPromise = scoreCustomerRecovery(
    "cust-1", "Student A", "Parent A", "+91 98000 00001", "+91 98000 00001", "Class 10",
    [inv], [], [], "2026-11-21"
  );

  assert.ok(
    resWithPromise.priorityScore < resWithoutPromise.priorityScore,
    `Future promise should reduce priority score (with promise: ${resWithPromise.priorityScore}, without: ${resWithoutPromise.priorityScore})`
  );
  console.log(`  ✓ Passed: Future promise reduced urgency from ${resWithoutPromise.priorityScore} to ${resWithPromise.priorityScore}.`);
}

// -------------------------------------------------------------
// Test 5: Duplicate Customer Aggregation
// -------------------------------------------------------------
console.log("\nTest 5: Duplicate customer aggregation (multi-invoice merging)...");
{
  const cust = createMockCustomer({
    id: "cust-multi",
    name: "Kabir Singh",
  });

  const inv1 = createMockInvoice({
    id: "inv-k1",
    customerId: "cust-multi",
    invoiceNumber: "INV-2026-101",
    dueDate: "2026-11-05", // 16 days overdue
    balanceDue: 6000,
  });

  const inv2 = createMockInvoice({
    id: "inv-k2",
    customerId: "cust-multi",
    invoiceNumber: "INV-2026-102",
    dueDate: "2026-11-15", // 6 days overdue
    balanceDue: 4500,
  });

  const queue = buildRecoveryQueue([cust], [inv1, inv2], [], [], "2026-11-21");

  assert.equal(queue.length, 1, "Must aggregate multiple overdue invoices for same student into 1 recovery item");
  assert.equal(queue[0].customerId, "cust-multi");
  assert.equal(queue[0].totalOverdueAmount, 10500, "Must sum balances: 6,000 + 4,500 = 10,500");
  assert.equal(queue[0].oldestOverdueDueDate, "2026-11-05", "Oldest overdue date must be 2026-11-05");
  assert.equal(queue[0].maxOverdueDays, 16);
  assert.deepEqual(queue[0].invoiceNumbers, ["INV-2026-101", "INV-2026-102"]);
  console.log("  ✓ Passed: 2 invoices cleanly aggregated into 1 profile (₹10,500 total, 16d oldest overdue).");
}

// -------------------------------------------------------------
// Test 6: Follow-Up State Updates & Recency
// -------------------------------------------------------------
console.log("\nTest 6: Follow-up state updates & recency adjustments...");
{
  const inv = createMockInvoice({ dueDate: "2026-11-10", balanceDue: 8000 });

  // Case A: Followed up today
  const fupToday = {
    id: "fup-today",
    customerId: "cust-mock-1",
    customerName: "Arjun Verma",
    parentName: "Ramesh Verma",
    followUpDate: "2026-11-21", // Today
    outcome: "contacted",
    notes: "Spoke with father",
    recordedAt: "Today, 10:00 AM",
  };

  // Case B: No response 4 days ago
  const fupOldUnanswered = {
    id: "fup-old",
    customerId: "cust-mock-1",
    customerName: "Arjun Verma",
    parentName: "Ramesh Verma",
    followUpDate: "2026-11-16", // 5 days ago
    outcome: "no_response",
    notes: "WhatsApp not answered",
    recordedAt: "16 Nov",
  };

  const resToday = scoreCustomerRecovery(
    "cust-mock-1", "Arjun", "Ramesh", "+91 98765 43210", "+91 98765 43210", "Class 10",
    [inv], [], [fupToday], "2026-11-21"
  );

  const resUnanswered = scoreCustomerRecovery(
    "cust-mock-1", "Arjun", "Ramesh", "+91 98765 43210", "+91 98765 43210", "Class 10",
    [inv], [], [fupOldUnanswered], "2026-11-21"
  );

  assert.ok(
    resUnanswered.priorityScore > resToday.priorityScore,
    `Unanswered follow-up from 5d ago (score: ${resUnanswered.priorityScore}) must prioritize above already-contacted today (score: ${resToday.priorityScore})`
  );
  console.log(`  ✓ Passed: Already contacted today scored lower (${resToday.priorityScore}) than unanswered follow-up (${resUnanswered.priorityScore}).`);
}

// -------------------------------------------------------------
// Test 7: Exclusion of Paid, Draft, and Cancelled Invoices
// -------------------------------------------------------------
console.log("\nTest 7: Exclusion of paid, draft, and cancelled invoices...");
{
  const cust = createMockCustomer({ id: "cust-exclude" });

  const paidInv = createMockInvoice({
    id: "inv-paid",
    customerId: "cust-exclude",
    status: "paid",
    balanceDue: 0,
    dueDate: "2026-11-01",
  });

  const draftInv = createMockInvoice({
    id: "inv-draft",
    customerId: "cust-exclude",
    status: "draft",
    balanceDue: 7500,
    dueDate: "2026-11-01",
  });

  const cancelledInv = createMockInvoice({
    id: "inv-cancelled",
    customerId: "cust-exclude",
    status: "cancelled",
    balanceDue: 7500,
    dueDate: "2026-11-01",
  });

  const queue = buildRecoveryQueue([cust], [paidInv, draftInv, cancelledInv], [], [], "2026-11-21");

  assert.equal(queue.length, 0, "Paid, draft, and cancelled invoices must never enter recovery queue");
  console.log("  ✓ Passed: Non-overdue, paid, draft, and cancelled records completely excluded.");
}

// -------------------------------------------------------------
// Test 8: Zero-Mutation Guarantee of Original Records
// -------------------------------------------------------------
console.log("\nTest 8: Zero-mutation guarantee of original records...");
{
  const cust = createMockCustomer({ id: "cust-mut-1" });
  const inv = createMockInvoice({ id: "inv-mut-1", balanceDue: 8500 });
  const prm = createMockPromise({ id: "prm-mut-1" });
  const fup = {
    id: "fup-mut-1",
    customerId: "cust-mut-1",
    customerName: "Arjun Verma",
    parentName: "Ramesh Verma",
    followUpDate: "2026-11-16",
    outcome: "contacted",
    notes: "Follow-up note",
    recordedAt: "16 Nov",
  };

  const customersList = [cust];
  const invoicesList = [inv];
  const promisesList = [prm];
  const followUpsList = [fup];

  const beforeCust = JSON.stringify(customersList);
  const beforeInv = JSON.stringify(invoicesList);
  const beforePrm = JSON.stringify(promisesList);
  const beforeFup = JSON.stringify(followUpsList);

  // Run pipeline
  const queue = buildRecoveryQueue(customersList, invoicesList, promisesList, followUpsList, "2026-11-21");
  computeRecoveryStats(queue, invoicesList, promisesList, followUpsList, [], "2026-11-21");
  generateReminderDrafts(queue[0]);

  assert.equal(JSON.stringify(customersList), beforeCust, "Customers array must remain unmutated");
  assert.equal(JSON.stringify(invoicesList), beforeInv, "Invoices array must remain unmutated");
  assert.equal(JSON.stringify(promisesList), beforePrm, "Promises array must remain unmutated");
  assert.equal(JSON.stringify(followUpsList), beforeFup, "Follow-ups array must remain unmutated");
  console.log("  ✓ Passed: Strict immutability verified across all financial data structures.");
}

console.log("\n========================================================");
console.log("✓ ALL 8 RECOVERY QUEUE TEST SCENARIOS PASSED CLEANLY!");
console.log("========================================================");
