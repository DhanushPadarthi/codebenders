/**
 * Deterministic Cashflow Forecasting & Scenario Planning Engine
 * 
 * Computes daily cash roll-forwards across 30, 60, and 90-day horizons.
 * Operates purely on integer paise to eliminate floating point rounding inaccuracies.
 * Zero AI hallucination: 100% deterministic arithmetic.
 */

import type {
  SampleInvoice,
  SampleBill,
  SampleCustomer,
  SamplePaymentPromise,
} from "@/lib/sample-data";

export interface CashflowForecastPoint {
  date: string;
  displayDate: string;
  dayIndex: number;
  expectedInflows: number;
  upcomingExpenses: number;
  netCashflow: number;
  projectedBalance: number;
  milestoneDescription?: string;
  inflowItems: CashflowScheduleItem[];
  outflowItems: CashflowScheduleItem[];
}

export interface CashflowScheduleItem {
  id: string;
  date: string;
  title: string;
  category: string;
  amount: number;
  type: "confirmed_receivable" | "payment_promise" | "projected_tuition_cycle" | "bill_outflow" | "recurring_overhead";
  confidence: number; // 0.0 to 1.0
  sourceId?: string;
  sourceEntity: "invoice" | "promise" | "customer" | "bill";
  isEstimate: boolean;
  notes?: string;
}

export interface CashflowSummary {
  openingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  netCashflow: number;
  projectedClosingBalance: number;
  lowestProjectedBalance: number;
  lowestBalanceDate: string;
  safeReserveThreshold: number;
  hasDeficit: boolean;
  firstDeficitDate?: string;
  horizonDays: 30 | 60 | 90;
}

export interface SmartCashflowAlert {
  id: string;
  type: "deficit_warning" | "buffer_breach" | "large_outflow" | "overdue_receivables" | "promise_reliance";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  impactAmount: number;
  targetDate?: string;
  recommendation: string;
}

export interface WhatIfScenarioParams {
  id?: string;
  name?: string;
  // Scenario A: Delay student payment
  delayedInvoiceId?: string;
  delayDays?: number;
  // Scenario B: Increase operating overheads
  overheadIncreasePercent?: number;
  overheadCategory?: string; // "ALL" or specific category
  // Scenario C: Early bill payment
  earlyBillId?: string;
  earlyPayDate?: string;
}

export interface CashflowEngineInputs {
  asOfDate?: string;
  horizonDays?: 30 | 60 | 90;
  openingCashBalance: number;
  invoices: SampleInvoice[];
  bills: SampleBill[];
  customers: SampleCustomer[];
  promises: SamplePaymentPromise[];
  safeReserveThreshold?: number;
  scenario?: WhatIfScenarioParams;
}

export interface CashflowEngineResult {
  summary: CashflowSummary;
  points: CashflowForecastPoint[];
  alerts: SmartCashflowAlert[];
  inflowSchedule: CashflowScheduleItem[];
  outflowSchedule: CashflowScheduleItem[];
  assumptions: string[];
}

/**
 * Helper to add days to an ISO YYYY-MM-DD date deterministically.
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Formats YYYY-MM-DD to short display string (e.g. "21 Nov", "05 Dec")
 */
export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Builds the schedule of expected cash inflows without double-counting invoices and promises.
 */
export function buildInflowsSchedule(
  invoices: SampleInvoice[],
  promises: SamplePaymentPromise[],
  customers: SampleCustomer[],
  asOfDate: string,
  horizonDays: number,
  scenario?: WhatIfScenarioParams
): CashflowScheduleItem[] {
  const items: CashflowScheduleItem[] = [];
  const horizonEndDate = addDaysToDate(asOfDate, horizonDays);

  // 1. Process Open Invoices & Linked Promises
  const eligibleInvoices = invoices.filter(
    (inv) => inv.status !== "draft" && inv.status !== "cancelled" && inv.balanceDue > 0
  );

  eligibleInvoices.forEach((inv) => {
    // Check for pending payment promises on this invoice
    const linkedPromises = promises.filter(
      (p) =>
        p.status === "pending" &&
        (p.invoiceId === inv.id || p.invoiceId === inv.invoiceNumber)
    );

    let balanceDuePaise = Math.round(inv.balanceDue * 100);

    // Apply Scenario A delay if this invoice was targeted
    let invoiceDueDate = inv.dueDate;
    if (scenario?.delayedInvoiceId && (scenario.delayedInvoiceId === inv.id || scenario.delayedInvoiceId === inv.invoiceNumber)) {
      const delay = scenario.delayDays || 15;
      invoiceDueDate = addDaysToDate(invoiceDueDate, delay);
    }

    if (linkedPromises.length > 0) {
      // Multiple promises capped at remaining invoice balance
      linkedPromises.forEach((promise) => {
        if (balanceDuePaise <= 0) return;

        const promisePaise = Math.round(promise.promisedAmount * 100);
        const scheduledPaise = Math.min(balanceDuePaise, promisePaise);
        balanceDuePaise -= scheduledPaise;

        let scheduledDate = promise.promisedDate;
        // If promised date is in the past, assume collection on asOfDate
        if (scheduledDate < asOfDate) {
          scheduledDate = asOfDate;
        }

        // Check if scenario delays this invoice's promise too
        if (scenario?.delayedInvoiceId && (scenario.delayedInvoiceId === inv.id || scenario.delayedInvoiceId === inv.invoiceNumber)) {
          scheduledDate = addDaysToDate(scheduledDate, scenario.delayDays || 15);
        }

        if (scheduledDate <= horizonEndDate) {
          items.push({
            id: `sched-prm-${promise.id}`,
            date: scheduledDate,
            title: `Promise: ${inv.customerName} (${inv.invoiceNumber})`,
            category: "Tuition Promise",
            amount: scheduledPaise / 100,
            type: "payment_promise",
            confidence: promise.confidenceScore ?? 0.85,
            sourceId: promise.id,
            sourceEntity: "promise",
            isEstimate: false,
            notes: `Confirmed promise from ${promise.rawMessage}`,
          });
        }
      });
    }

    // Schedule any residual unpaid balance on the invoice's due date
    if (balanceDuePaise > 0) {
      let residualDate = invoiceDueDate;
      // Overdue invoices with no promise: expected within 3-day recovery window
      if (residualDate < asOfDate) {
        residualDate = addDaysToDate(asOfDate, 3);
      }

      if (residualDate <= horizonEndDate) {
        items.push({
          id: `sched-inv-${inv.id}`,
          date: residualDate,
          title: `Fee Balance: ${inv.customerName} (${inv.invoiceNumber})`,
          category: "Tuition Receivable",
          amount: balanceDuePaise / 100,
          type: "confirmed_receivable",
          confidence: inv.status === "overdue" ? 0.75 : 0.9,
          sourceId: inv.id,
          sourceEntity: "invoice",
          isEstimate: false,
          notes: `Remaining unpaid balance on invoice ${inv.invoiceNumber}`,
        });
      }
    }
  });

  // 2. Future Monthly Tuition Billing Cycles
  // Project future fee cycles for active students without duplicating existing invoices
  const activeCustomers = customers.filter((c) => c.status === "active");

  activeCustomers.forEach((cust) => {
    const cycleDay = cust.billingCycleDay || 10;
    const [asOfYear, asOfMonth] = asOfDate.split("-").map(Number);

    // Project up to 3 upcoming months
    for (let offset = 0; offset <= 3; offset++) {
      let targetMonth = asOfMonth + offset;
      let targetYear = asOfYear;
      if (targetMonth > 12) {
        targetYear += Math.floor((targetMonth - 1) / 12);
        targetMonth = ((targetMonth - 1) % 12) + 1;
      }

      const monthStr = String(targetMonth).padStart(2, "0");
      const dayStr = String(Math.min(cycleDay, 28)).padStart(2, "0");
      const cycleDate = `${targetYear}-${monthStr}-${dayStr}`;

      // Only include if date is strictly in the future and within horizon
      if (cycleDate > asOfDate && cycleDate <= horizonEndDate) {
        // Prevent double counting: check if an invoice already exists for this student in that month
        const hasExistingInvoiceInMonth = invoices.some((inv) => {
          const matchesStudent =
            inv.customerId === cust.id ||
            Boolean(inv.customerName && cust.name && inv.customerName.toLowerCase() === cust.name.toLowerCase());
          const isInMonth = inv.issueDate.startsWith(`${targetYear}-${monthStr}`);
          return matchesStudent && isInMonth;
        });

        if (!hasExistingInvoiceInMonth) {
          items.push({
            id: `sched-cycle-${cust.id}-${cycleDate}`,
            date: cycleDate,
            title: `Future Fee Cycle: ${cust.name}`,
            category: "Projected Tuition",
            amount: cust.defaultFeeAmount,
            type: "projected_tuition_cycle",
            confidence: 0.8,
            sourceId: cust.id,
            sourceEntity: "customer",
            isEstimate: true,
            notes: `Scheduled monthly tuition cycle (Day ${cycleDay}) for ${cust.gradeSubject}`,
          });
        }
      }
    }
  });

  return items;
}

/**
 * Builds the schedule of expected cash outflows (bills and recurring overheads).
 */
export function buildOutflowsSchedule(
  bills: SampleBill[],
  asOfDate: string,
  horizonDays: number,
  scenario?: WhatIfScenarioParams
): CashflowScheduleItem[] {
  const items: CashflowScheduleItem[] = [];
  const horizonEndDate = addDaysToDate(asOfDate, horizonDays);

  // 1. Process Unpaid Current Bills
  const unpaidBills = bills.filter((b) => b.status !== "paid" && !b.isGeneratedOccurrence);

  unpaidBills.forEach((bill) => {
    let billDueDate = bill.dueDate;

    // Overdue bill: assumed cleared within 48h to avoid penalty/disruption
    if (billDueDate < asOfDate) {
      billDueDate = addDaysToDate(asOfDate, 2);
    }

    // Apply Scenario C: Early bill payment
    if (scenario?.earlyBillId && scenario.earlyBillId === bill.id && scenario.earlyPayDate) {
      billDueDate = scenario.earlyPayDate;
    }

    // Apply Scenario B: Overhead cost increase
    let billAmount = bill.amount;
    if (scenario?.overheadIncreasePercent && scenario.overheadIncreasePercent > 0) {
      if (!scenario.overheadCategory || scenario.overheadCategory === "ALL" || scenario.overheadCategory === bill.category) {
        const factor = 1 + scenario.overheadIncreasePercent / 100;
        billAmount = Math.round(billAmount * factor * 100) / 100;
      }
    }

    if (billDueDate <= horizonEndDate) {
      items.push({
        id: `sched-bill-${bill.id}`,
        date: billDueDate,
        title: bill.title,
        category: bill.category,
        amount: billAmount,
        type: bill.isRecurring ? "recurring_overhead" : "bill_outflow",
        confidence: 1.0,
        sourceId: bill.id,
        sourceEntity: "bill",
        isEstimate: false,
        notes: bill.notes || `Overhead payment to ${bill.vendorName}`,
      });
    }
  });

  // 2. Process Future Recurring Bill Occurrences across 90-Day Horizon
  const recurringBases = bills.filter((b) => b.isRecurring && !b.isGeneratedOccurrence);

  recurringBases.forEach((baseBill) => {
    let occurrenceIndex = 1;
    let keepProjecting = true;

    while (keepProjecting && occurrenceIndex <= 6) {
      const [by, bm, bd] = baseBill.dueDate.split("-").map(Number);
      const nextDateObj = new Date(Date.UTC(by, bm - 1, bd));

      if (baseBill.recurringFrequency === "quarterly") {
        nextDateObj.setUTCMonth(nextDateObj.getUTCMonth() + 3 * occurrenceIndex);
      } else if (baseBill.recurringFrequency === "yearly") {
        nextDateObj.setUTCFullYear(nextDateObj.getUTCFullYear() + occurrenceIndex);
      } else {
        // default monthly
        nextDateObj.setUTCMonth(nextDateObj.getUTCMonth() + occurrenceIndex);
      }

      const nextDateStr = nextDateObj.toISOString().slice(0, 10);

      // Verify bounds
      if (nextDateStr > horizonEndDate) {
        keepProjecting = false;
        break;
      }

      if (baseBill.recurringEndDate && nextDateStr > baseBill.recurringEndDate) {
        keepProjecting = false;
        break;
      }

      // Check if duplicate bill already exists in bills list
      const alreadyExists = bills.some(
        (b) => b.title === baseBill.title && b.dueDate === nextDateStr
      );

      if (!alreadyExists && nextDateStr > asOfDate) {
        let occAmount = baseBill.amount;
        if (scenario?.overheadIncreasePercent && scenario.overheadIncreasePercent > 0) {
          if (!scenario.overheadCategory || scenario.overheadCategory === "ALL" || scenario.overheadCategory === baseBill.category) {
            const factor = 1 + scenario.overheadIncreasePercent / 100;
            occAmount = Math.round(occAmount * factor * 100) / 100;
          }
        }

        items.push({
          id: `sched-occ-${baseBill.id}-${nextDateStr}`,
          date: nextDateStr,
          title: `${baseBill.title} (${formatDisplayDate(nextDateStr)})`,
          category: baseBill.category,
          amount: occAmount,
          type: "recurring_overhead",
          confidence: 0.95,
          sourceId: baseBill.id,
          sourceEntity: "bill",
          isEstimate: true,
          notes: `Projected recurring cycle for ${baseBill.vendorName}`,
        });
      }

      occurrenceIndex += 1;
    }
  });

  return items;
}

/**
 * Calculates the complete deterministic cashflow projection.
 */
export function calculateCashflowForecast(inputs: CashflowEngineInputs): CashflowEngineResult {
  const asOfDate = inputs.asOfDate || "2026-11-21";
  const horizonDays = inputs.horizonDays || 30;
  const safeReserveThreshold = inputs.safeReserveThreshold ?? 50000;

  // 1. Build scheduled inflows and outflows
  const inflowSchedule = buildInflowsSchedule(
    inputs.invoices,
    inputs.promises,
    inputs.customers,
    asOfDate,
    horizonDays,
    inputs.scenario
  );

  const outflowSchedule = buildOutflowsSchedule(
    inputs.bills,
    asOfDate,
    horizonDays,
    inputs.scenario
  );

  // 2. Group daily amounts in integer paise
  const dailyInflowsPaise: Record<string, number> = {};
  const dailyOutflowsPaise: Record<string, number> = {};
  const dailyInflowItems: Record<string, CashflowScheduleItem[]> = {};
  const dailyOutflowItems: Record<string, CashflowScheduleItem[]> = {};

  inflowSchedule.forEach((item) => {
    dailyInflowsPaise[item.date] = (dailyInflowsPaise[item.date] || 0) + Math.round(item.amount * 100);
    dailyInflowItems[item.date] = dailyInflowItems[item.date] || [];
    dailyInflowItems[item.date].push(item);
  });

  outflowSchedule.forEach((item) => {
    dailyOutflowsPaise[item.date] = (dailyOutflowsPaise[item.date] || 0) + Math.round(item.amount * 100);
    dailyOutflowItems[item.date] = dailyOutflowItems[item.date] || [];
    dailyOutflowItems[item.date].push(item);
  });

  // 3. Roll forward day-by-day
  const points: CashflowForecastPoint[] = [];
  let currentBalancePaise = Math.round(inputs.openingCashBalance * 100);
  let totalInflowsPaise = 0;
  let totalOutflowsPaise = 0;

  let lowestBalancePaise = currentBalancePaise;
  let lowestBalanceDate = asOfDate;
  let firstDeficitDate: string | undefined = undefined;

  for (let d = 0; d <= horizonDays; d++) {
    const currentDate = addDaysToDate(asOfDate, d);
    const dayInflowsPaise = dailyInflowsPaise[currentDate] || 0;
    const dayOutflowsPaise = dailyOutflowsPaise[currentDate] || 0;

    totalInflowsPaise += dayInflowsPaise;
    totalOutflowsPaise += dayOutflowsPaise;

    currentBalancePaise = currentBalancePaise + dayInflowsPaise - dayOutflowsPaise;

    if (currentBalancePaise < lowestBalancePaise) {
      lowestBalancePaise = currentBalancePaise;
      lowestBalanceDate = currentDate;
    }

    if (currentBalancePaise < 0 && !firstDeficitDate) {
      firstDeficitDate = currentDate;
    }

    // Determine milestone descriptions for key dates
    let milestone: string | undefined = undefined;
    const inflowsToday = dailyInflowItems[currentDate] || [];
    const outflowsToday = dailyOutflowItems[currentDate] || [];

    if (outflowsToday.some((o) => o.amount >= 25000)) {
      const big = outflowsToday.find((o) => o.amount >= 25000)!;
      milestone = `Major Outflow: ${big.title} (₹${big.amount.toLocaleString("en-IN")})`;
    } else if (inflowsToday.some((i) => i.amount >= 10000)) {
      const big = inflowsToday.find((i) => i.amount >= 10000)!;
      milestone = `Inflow: ${big.title} (₹${big.amount.toLocaleString("en-IN")})`;
    }

    points.push({
      date: currentDate,
      displayDate: formatDisplayDate(currentDate),
      dayIndex: d,
      expectedInflows: dayInflowsPaise / 100,
      upcomingExpenses: dayOutflowsPaise / 100,
      netCashflow: (dayInflowsPaise - dayOutflowsPaise) / 100,
      projectedBalance: currentBalancePaise / 100,
      milestoneDescription: milestone,
      inflowItems: inflowsToday,
      outflowItems: outflowsToday,
    });
  }

  const summary: CashflowSummary = {
    openingBalance: inputs.openingCashBalance,
    totalInflows: totalInflowsPaise / 100,
    totalOutflows: totalOutflowsPaise / 100,
    netCashflow: (totalInflowsPaise - totalOutflowsPaise) / 100,
    projectedClosingBalance: currentBalancePaise / 100,
    lowestProjectedBalance: lowestBalancePaise / 100,
    lowestBalanceDate,
    safeReserveThreshold,
    hasDeficit: lowestBalancePaise < 0,
    firstDeficitDate,
    horizonDays,
  };

  // 4. Generate Smart Financial Alerts
  const alerts = generateSmartFinancialAlerts(
    points,
    summary,
    inputs.invoices,
    inputs.bills,
    inputs.promises,
    safeReserveThreshold
  );

  const assumptions = [
    `Baseline opening cash balance set to ₹${inputs.openingCashBalance.toLocaleString("en-IN")} from business settings.`,
    "Outstanding invoices with pending promises are scheduled on promised dates; residual balances are scheduled separately.",
    "Overdue invoices with no active promise are assumed collected within a 3-day recovery window.",
    "Overdue unpaid bills are assumed cleared within 48 hours to prevent service disconnection.",
    "Future tuition cycles for active students are projected on billing cycle days, avoiding duplication with existing monthly invoices.",
    "Recurring bills produce subsequent occurrences across the planning horizon, honoring recurrence end dates.",
  ];

  return {
    summary,
    points,
    alerts,
    inflowSchedule,
    outflowSchedule,
    assumptions,
  };
}

/**
 * Generates proactive, actionable financial warnings based on the deterministic forecast.
 */
export function generateSmartFinancialAlerts(
  points: CashflowForecastPoint[],
  summary: CashflowSummary,
  invoices: SampleInvoice[],
  bills: SampleBill[],
  promises: SamplePaymentPromise[],
  safeBuffer: number
): SmartCashflowAlert[] {
  const alerts: SmartCashflowAlert[] = [];

  // Alert 1: Projected Negative Cash Deficit
  if (summary.hasDeficit && summary.firstDeficitDate) {
    alerts.push({
      id: "alert-deficit",
      type: "deficit_warning",
      severity: "critical",
      title: "Projected Cash Deficit Detected",
      description: `Cash balance is projected to fall below ₹0 to ₹${summary.lowestProjectedBalance.toLocaleString("en-IN")} on ${formatDisplayDate(summary.firstDeficitDate)}.`,
      impactAmount: Math.abs(summary.lowestProjectedBalance),
      targetDate: summary.firstDeficitDate,
      recommendation: "Accelerate follow-ups on overdue student fees or negotiate deferred vendor bill settlements immediately.",
    });
  }

  // Alert 2: Reserve Buffer Breach
  if (!summary.hasDeficit && summary.lowestProjectedBalance < safeBuffer) {
    alerts.push({
      id: "alert-buffer",
      type: "buffer_breach",
      severity: "warning",
      title: "Safe Operational Buffer Breach",
      description: `Projected cash position touches ₹${summary.lowestProjectedBalance.toLocaleString("en-IN")} on ${formatDisplayDate(summary.lowestBalanceDate)}, below your ₹${safeBuffer.toLocaleString("en-IN")} safety threshold.`,
      impactAmount: safeBuffer - summary.lowestProjectedBalance,
      targetDate: summary.lowestBalanceDate,
      recommendation: "Maintain minimum 1-month operating reserve. Follow up with pending promises to protect liquidity.",
    });
  }

  // Alert 3: Major Approaching Outflow (Rent / Salaries > ₹25k)
  const bigUpcomingBill = bills.find(
    (b) => b.status !== "paid" && b.amount >= 25000 && b.dueDate >= "2026-11-21" && b.dueDate <= addDaysToDate("2026-11-21", 10)
  );
  if (bigUpcomingBill) {
    alerts.push({
      id: `alert-big-bill-${bigUpcomingBill.id}`,
      type: "large_outflow",
      severity: "warning",
      title: `Major Commitment Approaching: ${bigUpcomingBill.title}`,
      description: `₹${bigUpcomingBill.amount.toLocaleString("en-IN")} due to ${bigUpcomingBill.vendorName} on ${formatDisplayDate(bigUpcomingBill.dueDate)}.`,
      impactAmount: bigUpcomingBill.amount,
      targetDate: bigUpcomingBill.dueDate,
      recommendation: `Ensure collection of ₹${bigUpcomingBill.amount.toLocaleString("en-IN")} prior to ${formatDisplayDate(bigUpcomingBill.dueDate)} to avoid reserve depletion.`,
    });
  }

  // Alert 4: Large Overdue Student Receivables
  const overdueInvoices = invoices.filter(
    (inv) => inv.status === "overdue" && inv.balanceDue > 0
  );
  const totalOverdue = overdueInvoices.reduce((s, inv) => s + inv.balanceDue, 0);

  if (totalOverdue >= 15000) {
    alerts.push({
      id: "alert-overdue-receivables",
      type: "overdue_receivables",
      severity: "warning",
      title: "High Overdue Receivables Balance",
      description: `₹${totalOverdue.toLocaleString("en-IN")} remains overdue across ${overdueInvoices.length} student invoice(s).`,
      impactAmount: totalOverdue,
      recommendation: "Dispatch WhatsApp payment reminders with one-click payment links to clear pending balances.",
    });
  }

  // Alert 5: Heavy Reliance on Payment Promises
  const pendingPromises = promises.filter((p) => p.status === "pending");
  const totalPromised = pendingPromises.reduce((s, p) => s + p.promisedAmount, 0);

  if (summary.totalInflows > 0 && totalPromised / summary.totalInflows > 0.35) {
    alerts.push({
      id: "alert-promise-reliance",
      type: "promise_reliance",
      severity: "info",
      title: "Cashflow Sensitive to Payment Promises",
      description: `₹${totalPromised.toLocaleString("en-IN")} (${Math.round((totalPromised / summary.totalInflows) * 100)}% of near-term inflows) depends on uncollected verbal promises.`,
      impactAmount: totalPromised,
      recommendation: "Track promised dates closely; verify bank credits on the exact promised date.",
    });
  }

  return alerts;
}

export interface WhatIfSimulationResult {
  baseResult: CashflowEngineResult;
  scenarioResult: CashflowEngineResult;
  differenceClosingBalance: number;
  differenceLowestBalance: number;
  shortageDate?: string;
}

/**
 * Runs a comparative What-If Scenario simulation against the baseline forecast.
 * Performs calculations only; never mutates original financial records.
 */
export function simulateWhatIfScenario(
  baseInputs: CashflowEngineInputs,
  scenario: WhatIfScenarioParams
): WhatIfSimulationResult {
  const baseResult = calculateCashflowForecast({
    ...baseInputs,
    scenario: undefined,
  });

  const scenarioResult = calculateCashflowForecast({
    ...baseInputs,
    scenario,
  });

  const differenceClosingBalance =
    scenarioResult.summary.projectedClosingBalance - baseResult.summary.projectedClosingBalance;

  const differenceLowestBalance =
    scenarioResult.summary.lowestProjectedBalance - baseResult.summary.lowestProjectedBalance;

  return {
    baseResult,
    scenarioResult,
    differenceClosingBalance,
    differenceLowestBalance,
    shortageDate: scenarioResult.summary.firstDeficitDate,
  };
}
