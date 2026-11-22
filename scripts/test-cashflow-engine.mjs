/**
 * Test Suite: FeePulse Deterministic Cashflow Forecasting & Scenario Planning Engine
 * 
 * Verifies 11 core financial forecasting scenarios:
 * 1. 30/60/90-day horizons
 * 2. Opening balance calculation & roll-forward conservation
 * 3. Partial invoice collection (only balance due scheduled)
 * 4. Payment promise double-count prevention
 * 5. Multiple promises capped at invoice balance
 * 6. Paid and cancelled invoice exclusion
 * 7. Recurring bill occurrences and recurrence end dates
 * 8. Already-paid expense exclusion
 * 9. Negative cash position & deficit detection
 * 10. "What-If" Scenario comparison & sandbox isolation
 * 11. Immutability & zero-mutation guarantee
 */

import assert from "node:assert/strict";

// Dynamic import of TS module using experimental strip types
const {
  calculateCashflowForecast,
  simulateWhatIfScenario,
} = await import("../lib/finance/cashflow-engine.ts");

console.log("=== Running FeePulse Cashflow Engine Test Suite ===\n");

// Helper mock data factory
function createMockCustomer(overrides = {}) {
  return {
    id: "cust-mock-1",
    name: "Aarav Patel",
    parentName: "Sunil Patel",
    gradeSubject: "Grade 11 Mathematics",
    phone: "+91 98200 11223",
    whatsappNumber: "+91 98200 11223",
    defaultFeeAmount: 7500,
    billingCycleDay: 10,
    status: "active",
    totalInvoiced: 22500,
    totalCollected: 22500,
    outstandingBalance: 0,
    nextPaymentDate: "2026-12-10",
    overdueCount: 0,
    joinedDate: "2026-06-15",
    ...overrides,
  };
}

function createMockInvoice(overrides = {}) {
  return {
    id: "inv-mock-1",
    customerId: "cust-mock-1",
    invoiceNumber: "INV-2026-001",
    customerName: "Aarav Patel",
    customerGrade: "Grade 11 Mathematics",
    parentPhone: "+91 98200 11223",
    issueDate: "2026-11-01",
    dueDate: "2026-11-25",
    subtotal: 10000,
    discount: 0,
    totalAmount: 10000,
    amountPaid: 0,
    balanceDue: 10000,
    status: "sent",
    items: [{ id: "item-1", description: "Tuition", quantity: 1, unitPrice: 10000, totalPrice: 10000 }],
    ...overrides,
  };
}

function createMockBill(overrides = {}) {
  return {
    id: "bill-mock-1",
    title: "Centre Rent - Malviya Nagar",
    vendorName: "DLF Properties",
    category: "Rent",
    amount: 35000,
    dueDate: "2026-11-28",
    status: "unpaid",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringDayOfMonth: 28,
    ...overrides,
  };
}

function createMockPromise(overrides = {}) {
  return {
    id: "prm-mock-1",
    customerId: "cust-mock-1",
    invoiceId: "inv-mock-1",
    rawMessage: "Will pay via UPI by Friday",
    promisedAmount: 10000,
    promisedDate: "2026-11-24",
    status: "pending",
    confidenceScore: 0.95,
    ...overrides,
  };
}

// -------------------------------------------------------------
// Test 1: 30/60/90-Day Horizons
// -------------------------------------------------------------
console.log("Test 1: 30, 60, and 90-day horizon projection length...");
{
  const baseInputs = {
    asOfDate: "2026-11-21",
    openingCashBalance: 50000,
    invoices: [],
    bills: [],
    customers: [],
    promises: [],
  };

  const res30 = calculateCashflowForecast({ ...baseInputs, horizonDays: 30 });
  assert.equal(res30.points.length, 31, "30-day horizon must generate 31 daily points (day 0 to 30)");
  assert.equal(res30.summary.horizonDays, 30);

  const res60 = calculateCashflowForecast({ ...baseInputs, horizonDays: 60 });
  assert.equal(res60.points.length, 61, "60-day horizon must generate 61 daily points");
  assert.equal(res60.summary.horizonDays, 60);

  const res90 = calculateCashflowForecast({ ...baseInputs, horizonDays: 90 });
  assert.equal(res90.points.length, 91, "90-day horizon must generate 91 daily points");
  assert.equal(res90.summary.horizonDays, 90);
  console.log("  ✓ Passed: Correct daily point counts across all three horizons.");
}

// -------------------------------------------------------------
// Test 2: Opening Balance Calculation & Conservation
// -------------------------------------------------------------
console.log("\nTest 2: Opening balance conservation...");
{
  const opening = 65000;
  const inv = createMockInvoice({ balanceDue: 8000, dueDate: "2026-11-23" });
  const bill = createMockBill({ amount: 15000, dueDate: "2026-11-25", isRecurring: false });

  const res = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: opening,
    invoices: [inv],
    bills: [bill],
    customers: [],
    promises: [],
    horizonDays: 30,
  });

  assert.equal(res.summary.openingBalance, 65000);
  assert.equal(res.summary.totalInflows, 8000);
  assert.equal(res.summary.totalOutflows, 15000);
  assert.equal(res.summary.netCashflow, -7000);
  assert.equal(res.summary.projectedClosingBalance, 58000);
  assert.equal(res.points[0].projectedBalance, 65000); // Day 0 has no transactions
  console.log("  ✓ Passed: Opening cash balance and net cashflow conserved perfectly.");
}

// -------------------------------------------------------------
// Test 3: Partial Invoice Collection (Only Balance Due Scheduled)
// -------------------------------------------------------------
console.log("\nTest 3: Partial invoice collection (only balance due scheduled)...");
{
  const partialInv = createMockInvoice({
    totalAmount: 12000,
    amountPaid: 7000,
    balanceDue: 5000,
    status: "partially_paid",
    dueDate: "2026-11-26",
  });

  const res = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: 10000,
    invoices: [partialInv],
    bills: [],
    customers: [],
    promises: [],
    horizonDays: 30,
  });

  assert.equal(res.inflowSchedule.length, 1);
  assert.equal(res.inflowSchedule[0].amount, 5000, "Only unpaid ₹5,000 balance should be scheduled");
  assert.equal(res.summary.totalInflows, 5000);
  console.log("  ✓ Passed: Partial invoice schedules only remaining ₹5,000 balance.");
}

// -------------------------------------------------------------
// Test 4: Payment Promise Double-Count Prevention
// -------------------------------------------------------------
console.log("\nTest 4: Payment promise double-count prevention...");
{
  const inv = createMockInvoice({
    id: "inv-100",
    invoiceNumber: "INV-100",
    totalAmount: 9000,
    balanceDue: 9000,
    dueDate: "2026-11-27",
  });

  const prm = createMockPromise({
    id: "prm-100",
    invoiceId: "inv-100",
    promisedAmount: 9000,
    promisedDate: "2026-11-24",
    status: "pending",
  });

  const res = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: 20000,
    invoices: [inv],
    bills: [],
    customers: [],
    promises: [prm],
    horizonDays: 30,
  });

  // Must have 1 inflow item (the promise), not 2 (promise + invoice)
  assert.equal(res.inflowSchedule.length, 1);
  assert.equal(res.inflowSchedule[0].type, "payment_promise");
  assert.equal(res.inflowSchedule[0].amount, 9000);
  assert.equal(res.summary.totalInflows, 9000, "Total inflows must be exactly ₹9,000, not ₹18,000");
  console.log("  ✓ Passed: Invoice and linked promise scheduled as a single ₹9,000 inflow on promised date.");
}

// -------------------------------------------------------------
// Test 5: Multiple Promises Capped at Invoice Balance
// -------------------------------------------------------------
console.log("\nTest 5: Multiple promises capped at invoice balance...");
{
  const inv = createMockInvoice({
    id: "inv-200",
    totalAmount: 10000,
    balanceDue: 10000,
    dueDate: "2026-11-30",
  });

  const prm1 = createMockPromise({
    id: "prm-201",
    invoiceId: "inv-200",
    promisedAmount: 6000,
    promisedDate: "2026-11-22",
  });

  const prm2 = createMockPromise({
    id: "prm-202",
    invoiceId: "inv-200",
    promisedAmount: 6000, // Total promised is 12,000, but invoice balance is 10,000
    promisedDate: "2026-11-25",
  });

  const res = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: 20000,
    invoices: [inv],
    bills: [],
    customers: [],
    promises: [prm1, prm2],
    horizonDays: 30,
  });

  assert.equal(res.inflowSchedule.length, 2);
  assert.equal(res.inflowSchedule[0].amount, 6000);
  assert.equal(res.inflowSchedule[1].amount, 4000, "Second promise must be capped at residual ₹4,000");
  assert.equal(res.summary.totalInflows, 10000, "Sum of promises must not exceed invoice balance of ₹10,000");
  console.log("  ✓ Passed: Second promise capped at ₹4,000; total inflows capped at ₹10,000.");
}

// -------------------------------------------------------------
// Test 6: Paid and Cancelled Invoice Exclusion
// -------------------------------------------------------------
console.log("\nTest 6: Paid and cancelled invoice exclusion...");
{
  const paidInv = createMockInvoice({
    id: "inv-paid",
    totalAmount: 8000,
    amountPaid: 8000,
    balanceDue: 0,
    status: "paid",
  });

  const cancelledInv = createMockInvoice({
    id: "inv-cancelled",
    totalAmount: 9000,
    amountPaid: 0,
    balanceDue: 9000,
    status: "cancelled",
  });

  const draftInv = createMockInvoice({
    id: "inv-draft",
    totalAmount: 5000,
    amountPaid: 0,
    balanceDue: 5000,
    status: "draft",
  });

  const res = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: 50000,
    invoices: [paidInv, cancelledInv, draftInv],
    bills: [],
    customers: [],
    promises: [],
    horizonDays: 30,
  });

  assert.equal(res.inflowSchedule.length, 0, "Paid, cancelled, and draft invoices must be excluded");
  assert.equal(res.summary.totalInflows, 0);
  console.log("  ✓ Passed: Paid, cancelled, and draft invoices excluded from future cashflows.");
}

// -------------------------------------------------------------
// Test 7: Recurring Bill Occurrences & Recurrence End Dates
// -------------------------------------------------------------
console.log("\nTest 7: Recurring bill occurrences and recurrence end dates...");
{
  const recurringBill = createMockBill({
    id: "bill-rec",
    amount: 10000,
    dueDate: "2026-11-28",
    status: "unpaid",
    isRecurring: true,
    recurringFrequency: "monthly",
    recurringEndDate: "2026-12-31", // End date cuts off 2027 occurrences
  });

  // 90-day horizon: Nov 28 (base unpaid), Dec 28 (occurrence 1). Jan 28 is > recurringEndDate, so stopped.
  const res90 = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: 50000,
    invoices: [],
    bills: [recurringBill],
    customers: [],
    promises: [],
    horizonDays: 90,
  });

  // Should have exactly 2 scheduled outflows: Nov 28 and Dec 28
  assert.equal(res90.outflowSchedule.length, 2);
  assert.equal(res90.outflowSchedule[0].date, "2026-11-28");
  assert.equal(res90.outflowSchedule[1].date, "2026-12-28");
  assert.equal(res90.summary.totalOutflows, 20000);
  console.log("  ✓ Passed: Recurring bill generates correct future occurrences and stops at recurringEndDate.");
}

// -------------------------------------------------------------
// Test 8: Already-Paid Expense Exclusion
// -------------------------------------------------------------
console.log("\nTest 8: Already-paid expense exclusion...");
{
  const paidBill = createMockBill({
    id: "bill-paid",
    amount: 12000,
    status: "paid",
    paidDate: "2026-11-18",
    isRecurring: false,
  });

  const res = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: 50000,
    invoices: [],
    bills: [paidBill],
    customers: [],
    promises: [],
    horizonDays: 30,
  });

  assert.equal(res.outflowSchedule.length, 0, "Already-paid bills must not be scheduled as outflows");
  assert.equal(res.summary.totalOutflows, 0);
  console.log("  ✓ Passed: Paid expenses excluded from future outflow schedules.");
}

// -------------------------------------------------------------
// Test 9: Negative Cash Position & Deficit Detection
// -------------------------------------------------------------
console.log("\nTest 9: Negative cash position & deficit detection...");
{
  const opening = 10000;
  const bigBill = createMockBill({
    amount: 35000,
    dueDate: "2026-11-24",
    isRecurring: false,
  });

  const res = calculateCashflowForecast({
    asOfDate: "2026-11-21",
    openingCashBalance: opening,
    invoices: [],
    bills: [bigBill],
    customers: [],
    promises: [],
    horizonDays: 30,
  });

  assert.equal(res.summary.hasDeficit, true);
  assert.equal(res.summary.lowestProjectedBalance, -25000);
  assert.equal(res.summary.firstDeficitDate, "2026-11-24");

  const deficitAlert = res.alerts.find((a) => a.type === "deficit_warning");
  assert.ok(deficitAlert, "Engine must generate a critical deficit warning alert");
  assert.equal(deficitAlert.severity, "critical");
  assert.equal(deficitAlert.impactAmount, 25000);
  console.log("  ✓ Passed: Deficit correctly detected, first deficit date tagged, and critical alert generated.");
}

// -------------------------------------------------------------
// Test 10: "What-If" Scenario Simulation Comparison
// -------------------------------------------------------------
console.log("\nTest 10: What-If scenario simulation comparison...");
{
  const inv = createMockInvoice({
    id: "inv-sim-1",
    customerName: "Priya Nair",
    balanceDue: 12000,
    dueDate: "2026-11-25",
  });
  const bill = createMockBill({
    id: "bill-sim-1",
    amount: 15000,
    dueDate: "2026-11-28",
    isRecurring: false,
  });

  const baseInputs = {
    asOfDate: "2026-11-21",
    openingCashBalance: 40000,
    invoices: [inv],
    bills: [bill],
    customers: [],
    promises: [],
    horizonDays: 30,
  };

  const simulation = simulateWhatIfScenario(baseInputs, {
    delayedInvoiceId: "inv-sim-1",
    delayDays: 15, // delays invoice from 25 Nov to 10 Dec
  });

  assert.equal(simulation.baseResult.summary.projectedClosingBalance, 37000); // 40k + 12k - 15k
  // In 30 days (Nov 21 to Dec 21), 10 Dec is still within 30 days, so closing balance remains 37k,
  // but on 28 Nov lowest balance will be 25k (before invoice arrives) instead of 37k!
  assert.equal(simulation.scenarioResult.summary.projectedClosingBalance, 37000);
  assert.equal(simulation.scenarioResult.summary.lowestProjectedBalance, 25000);
  assert.equal(simulation.baseResult.summary.lowestProjectedBalance, 37000);
  assert.equal(simulation.differenceLowestBalance, -12000);
  console.log("  ✓ Passed: What-If simulation accurately reflects cash dip during payment delay.");
}

// -------------------------------------------------------------
// Test 11: Immutability & Zero Mutation Guarantee
// -------------------------------------------------------------
console.log("\nTest 11: Immutability & zero mutation guarantee...");
{
  const inv = createMockInvoice({ id: "inv-imm-1", balanceDue: 8000 });
  const bill = createMockBill({ id: "bill-imm-1", amount: 14000 });
  const prm = createMockPromise({ id: "prm-imm-1", promisedAmount: 8000 });
  const cust = createMockCustomer({ id: "cust-imm-1" });

  const inputs = {
    asOfDate: "2026-11-21",
    openingCashBalance: 50000,
    invoices: [inv],
    bills: [bill],
    customers: [cust],
    promises: [prm],
    horizonDays: 30,
  };

  const snapshotBefore = JSON.stringify(inputs);

  // Run forecast & simulation
  calculateCashflowForecast(inputs);
  simulateWhatIfScenario(inputs, { overheadIncreasePercent: 20 });

  const snapshotAfter = JSON.stringify(inputs);

  assert.equal(snapshotBefore, snapshotAfter, "Input objects must not be mutated in any way by forecast or simulation");
  console.log("  ✓ Passed: Zero mutation guarantee strictly verified.");
}

console.log("\n========================================================");
console.log("✓ ALL 11 CASHFLOW ENGINE TEST SCENARIOS PASSED CLEANLY!");
console.log("========================================================");
