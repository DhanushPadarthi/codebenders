/**
 * Smart Recovery Queue Priority Scoring & Collection Engine
 * 
 * Computes deterministic, explainable priority scores for overdue student receivables.
 * Zero AI hallucination: pure TypeScript arithmetic.
 * Groups by customer to guarantee no double-counting of multiple overdue invoices.
 */

import type {
  SampleInvoice,
  SampleCustomer,
  SamplePaymentPromise,
  RecoveryFollowUp,
  FollowUpTone,
} from "@/lib/sample-data";

export interface CustomerRecoveryItem {
  customerId: string;
  studentName: string;
  parentName: string;
  phone: string;
  whatsappNumber: string;
  gradeSubject: string;
  invoices: SampleInvoice[];
  invoiceNumbers: string[];
  totalOverdueAmount: number;
  oldestOverdueDueDate: string;
  maxOverdueDays: number;
  activePromise?: SamplePaymentPromise;
  lastFollowUp?: RecoveryFollowUp;
  followUpCount: number;
  unsuccessfulFollowUpCount: number;
  priorityScore: number;
  priorityCategory: "Urgent" | "High" | "Medium" | "Low";
  priorityReason: string;
  recommendedAction: string;
  recommendedTone: FollowUpTone;
}

export interface RecoveryQueueDashboardStats {
  totalOverdueInvoices: number;
  totalOverdueAmount: number;
  highPriorityCustomersCount: number; // Urgent + High
  brokenPromisesCount: number;
  followUpsDueTodayCount: number;
  amountRecoveredThisMonth: number;
}

export interface ReminderDrafts {
  friendly: string;
  polite: string;
  firm: string;
}

/**
 * Calculates calendar day difference deterministically: dateA - dateB
 */
export function getDaysDifference(dateA: string, dateB: string): number {
  const [yA, mA, dA] = dateA.split("-").map(Number);
  const [yB, mB, dB] = dateB.split("-").map(Number);
  const timeA = Date.UTC(yA, mA - 1, dA);
  const timeB = Date.UTC(yB, mB - 1, dB);
  return Math.round((timeA - timeB) / (1000 * 60 * 60 * 24));
}

/**
 * Computes the priority score and details for an individual aggregated customer recovery profile.
 */
export function scoreCustomerRecovery(
  customerId: string,
  studentName: string,
  parentName: string,
  phone: string,
  whatsappNumber: string,
  gradeSubject: string,
  customerInvoices: SampleInvoice[],
  promises: SamplePaymentPromise[],
  followUps: RecoveryFollowUp[],
  asOfDate: string = "2026-11-21"
): CustomerRecoveryItem {
  // 1. Invoices & Balances (only overdue portions)
  const overdueInvoices = customerInvoices.filter(
    (inv) =>
      inv.status !== "draft" &&
      inv.status !== "cancelled" &&
      inv.balanceDue > 0 &&
      inv.dueDate < asOfDate
  );

  const totalOverduePaise = overdueInvoices.reduce(
    (sum, inv) => sum + Math.round(inv.balanceDue * 100),
    0
  );
  const totalOverdueAmount = totalOverduePaise / 100;

  // Find oldest due date
  const oldestDueDate = overdueInvoices.reduce((oldest, inv) => {
    return inv.dueDate < oldest ? inv.dueDate : oldest;
  }, overdueInvoices[0]?.dueDate || asOfDate);

  const maxOverdueDays = Math.max(0, getDaysDifference(asOfDate, oldestDueDate));
  const invoiceNumbers = overdueInvoices.map((i) => i.invoiceNumber);

  // 2. Active Promises
  // Look for promises linked to customer or any overdue invoice
  const customerPromises = promises.filter(
    (p) =>
      p.customerId === customerId ||
      overdueInvoices.some((inv) => inv.id === p.invoiceId || inv.invoiceNumber === p.invoiceId)
  );

  // Prioritize broken promises first, then pending promises
  const brokenPromise = customerPromises.find((p) => p.status === "broken");
  const pendingPromise = customerPromises.find((p) => p.status === "pending");
  const activePromise = brokenPromise || pendingPromise;

  // 3. Follow-up History
  const custFollowUps = followUps.filter((f) => f.customerId === customerId);
  // Sort descending by followUpDate
  const sortedFollowUps = [...custFollowUps].sort((a, b) => b.followUpDate.localeCompare(a.followUpDate));
  const lastFollowUp = sortedFollowUps[0];
  const followUpCount = custFollowUps.length;
  const unsuccessfulFollowUpCount = custFollowUps.filter((f) => f.outcome === "no_response").length;

  // 4. Deterministic Priority Scoring (0 - 100 scale)
  let score = 0;
  const reasonParts: string[] = [];

  // Factor A: Overdue Duration
  if (maxOverdueDays >= 20) {
    score += 55;
    reasonParts.push(`${maxOverdueDays} days overdue (>20d critical)`);
  } else if (maxOverdueDays >= 14) {
    score += 45;
    reasonParts.push(`${maxOverdueDays} days overdue (2+ weeks)`);
  } else if (maxOverdueDays >= 7) {
    score += 30;
    reasonParts.push(`${maxOverdueDays} days overdue`);
  } else if (maxOverdueDays >= 3) {
    score += 20;
    reasonParts.push(`${maxOverdueDays} days overdue`);
  } else {
    score += 10;
    reasonParts.push(`${maxOverdueDays} days overdue (grace period)`);
  }

  // Factor B: Outstanding Amount Bracket
  if (totalOverdueAmount >= 10000) {
    score += 25;
    reasonParts.push(`High balance (₹${totalOverdueAmount.toLocaleString("en-IN")})`);
  } else if (totalOverdueAmount >= 5000) {
    score += 15;
    reasonParts.push(`Balance ₹${totalOverdueAmount.toLocaleString("en-IN")}`);
  } else {
    score += 5;
    reasonParts.push(`Balance ₹${totalOverdueAmount.toLocaleString("en-IN")}`);
  }

  // Factor C: Promise Status
  if (activePromise?.status === "broken") {
    score += 35;
    reasonParts.push(`Broken promise from ${activePromise.promisedDate}`);
  } else if (activePromise?.status === "pending" && activePromise.promisedDate === asOfDate) {
    score += 20;
    reasonParts.push("Payment promise due TODAY");
  } else if (activePromise?.status === "pending" && activePromise.promisedDate > asOfDate) {
    score -= 25; // Valid future promise in place gives grace
    reasonParts.push(`Valid promise pending for ${activePromise.promisedDate}`);
  }

  // Factor D: Follow-up Recency & Unsuccessful History
  if (lastFollowUp) {
    const daysSinceFollowUp = getDaysDifference(asOfDate, lastFollowUp.followUpDate);
    if (daysSinceFollowUp === 0) {
      score -= 15; // Already followed up today
      reasonParts.push("Followed up today");
    } else if (daysSinceFollowUp >= 4) {
      score += 10;
      reasonParts.push(`No follow-up in ${daysSinceFollowUp} days`);
    }

    if (unsuccessfulFollowUpCount > 0) {
      const penalty = Math.min(15, unsuccessfulFollowUpCount * 5);
      score += penalty;
      reasonParts.push(`${unsuccessfulFollowUpCount} unanswered follow-up(s)`);
    }
  } else {
    // Never followed up
    score += 10;
    reasonParts.push("No previous follow-up recorded");
  }

  // Clamping score between 5 and 100
  const finalScore = Math.max(5, Math.min(100, score));

  // Determine Priority Category
  let priorityCategory: "Urgent" | "High" | "Medium" | "Low";
  if (finalScore >= 75) {
    priorityCategory = "Urgent";
  } else if (finalScore >= 50) {
    priorityCategory = "High";
  } else if (finalScore >= 25) {
    priorityCategory = "Medium";
  } else {
    priorityCategory = "Low";
  }

  // Determine Recommended Action & Tone
  let recommendedAction: string;
  let recommendedTone: FollowUpTone;

  if (activePromise?.status === "broken") {
    recommendedTone = "firm";
    recommendedAction = `Send firm follow-up regarding broken promise of ₹${activePromise.promisedAmount.toLocaleString("en-IN")}`;
  } else if (activePromise?.status === "pending" && activePromise.promisedDate === asOfDate) {
    recommendedTone = "polite";
    recommendedAction = `Verify received payment or check status for promise due today (₹${activePromise.promisedAmount.toLocaleString("en-IN")})`;
  } else if (maxOverdueDays >= 14 || finalScore >= 75) {
    recommendedTone = "firm";
    recommendedAction = "Send firm tone reminder to clear overdue balance before next batch class";
  } else if (maxOverdueDays >= 6 || finalScore >= 50) {
    recommendedTone = "polite";
    recommendedAction = "Send polite professional reminder with UPI payment link";
  } else {
    recommendedTone = "friendly";
    recommendedAction = "Send gentle friendly reminder on upcoming payment";
  }

  return {
    customerId,
    studentName,
    parentName,
    phone,
    whatsappNumber,
    gradeSubject,
    invoices: overdueInvoices,
    invoiceNumbers,
    totalOverdueAmount,
    oldestOverdueDueDate: oldestDueDate,
    maxOverdueDays,
    activePromise,
    lastFollowUp,
    followUpCount,
    unsuccessfulFollowUpCount,
    priorityScore: finalScore,
    priorityCategory,
    priorityReason: reasonParts.join(" • "),
    recommendedAction,
    recommendedTone,
  };
}

/**
 * Builds the complete Smart Recovery Queue from current application state.
 * Groups by customer to prevent duplicate customer cards when multiple invoices are overdue.
 */
export function buildRecoveryQueue(
  customers: SampleCustomer[],
  invoices: SampleInvoice[],
  promises: SamplePaymentPromise[],
  followUps: RecoveryFollowUp[],
  asOfDate: string = "2026-11-21"
): CustomerRecoveryItem[] {
  const recoveryItems: CustomerRecoveryItem[] = [];

  // Find all customers who have at least one overdue invoice
  customers.forEach((cust) => {
    const custInvoices = invoices.filter(
      (inv) =>
        (inv.customerId === cust.id || inv.customerName.toLowerCase() === cust.name.toLowerCase()) &&
        inv.status !== "draft" &&
        inv.status !== "cancelled" &&
        inv.balanceDue > 0 &&
        inv.dueDate < asOfDate
    );

    if (custInvoices.length > 0) {
      const item = scoreCustomerRecovery(
        cust.id,
        cust.name,
        cust.parentName,
        cust.phone,
        cust.whatsappNumber || cust.phone,
        cust.gradeSubject,
        custInvoices,
        promises,
        followUps,
        asOfDate
      );
      recoveryItems.push(item);
    }
  });

  // Sort descending by priority score
  recoveryItems.sort((a, b) => b.priorityScore - a.priorityScore);

  return recoveryItems;
}

/**
 * Computes top-level Recovery Queue KPI statistics.
 */
export function computeRecoveryStats(
  recoveryQueue: CustomerRecoveryItem[],
  invoices: SampleInvoice[],
  promises: SamplePaymentPromise[],
  followUps: RecoveryFollowUp[],
  payments: Array<{ amount: number; paymentDate?: string; paidAt?: string }>,
  asOfDate: string = "2026-11-21"
): RecoveryQueueDashboardStats {
  const overdueInvoices = invoices.filter(
    (inv) =>
      inv.status !== "draft" &&
      inv.status !== "cancelled" &&
      inv.balanceDue > 0 &&
      inv.dueDate < asOfDate
  );

  const totalOverduePaise = overdueInvoices.reduce(
    (sum, inv) => sum + Math.round(inv.balanceDue * 100),
    0
  );

  const highPriorityCount = recoveryQueue.filter(
    (item) => item.priorityCategory === "Urgent" || item.priorityCategory === "High"
  ).length;

  const brokenPromisesCount = promises.filter((p) => p.status === "broken").length;

  // Follow-ups due today:
  // 1. Follow-ups where nextFollowUpDate === asOfDate
  // 2. Active promises due today
  const dueTodayCount = recoveryQueue.filter((item) => {
    const nextFupDueToday = item.lastFollowUp?.nextFollowUpDate === asOfDate;
    const promiseDueToday = item.activePromise?.status === "pending" && item.activePromise.promisedDate === asOfDate;
    return nextFupDueToday || promiseDueToday;
  }).length;

  // Month collections (e.g. November 2026)
  const currentMonthPrefix = asOfDate.slice(0, 7); // "2026-11"
  const recoveredPaise = payments.reduce((sum, p) => {
    const isThisMonth = p.paymentDate?.startsWith(currentMonthPrefix) || p.paidAt?.includes("Nov");
    return isThisMonth ? sum + Math.round(p.amount * 100) : sum;
  }, 0);

  return {
    totalOverdueInvoices: overdueInvoices.length,
    totalOverdueAmount: totalOverduePaise / 100,
    highPriorityCustomersCount: highPriorityCount,
    brokenPromisesCount,
    followUpsDueTodayCount: dueTodayCount,
    amountRecoveredThisMonth: recoveredPaise / 100,
  };
}

/**
 * Generates three distinct reminder drafts (Friendly, Polite, Firm) for a recovery item.
 */
export function generateReminderDrafts(
  item: CustomerRecoveryItem,
  businessName: string = "Sharma Maths Academy",
  ownerName: string = "Rajesh Sharma",
  upiId: string = "sharmamaths@upi"
): ReminderDrafts {
  const invoiceList = item.invoiceNumbers.join(", ");
  const formattedAmount = `₹${item.totalOverdueAmount.toLocaleString("en-IN")}`;

  // 1. Friendly Tone (Gentle, warm, suitable for minor delays)
  const friendly = `Dear ${item.parentName},

Hope you and ${item.studentName} are having a wonderful week!

This is a gentle reminder that ${item.studentName}'s tuition fee for ${item.gradeSubject} of ${formattedAmount} (Invoice ${invoiceList}) was due on ${item.oldestOverdueDueDate}.

Could you please arrange to clear this at your convenience? You can pay directly via UPI to: ${upiId}

If you have already transferred the fee, please ignore this message.

Warm regards,
${ownerName}
${businessName}`;

  // 2. Polite & Professional Tone (Objective, clear, courteous)
  const polite = `Dear ${item.parentName},

This is a polite reminder from ${businessName} regarding the tuition fee for ${item.studentName} (${item.gradeSubject}).

Total outstanding balance is ${formattedAmount} across Invoice(s) ${invoiceList}, which is now ${item.maxOverdueDays} days past due (${item.oldestOverdueDueDate}).

Kindly arrange the payment at your earliest convenience to ensure uninterrupted class attendance and study portal access.

Payment Options:
• UPI ID: ${upiId}
• Cash / Cheque at centre reception

If payment has already been initiated, please share the transaction reference. Thank you for your continued cooperation.

Best regards,
${ownerName}
${businessName}`;

  // 3. Firm but Respectful Tone (Direct, assertive, references promises)
  const promiseNote = item.activePromise?.status === "broken"
    ? ` Following our earlier discussion regarding payment on ${item.activePromise.promisedDate}, we note this remains unsettled.`
    : "";

  const firm = `Dear ${item.parentName},

This is an urgent notice regarding the outstanding tuition fee of ${formattedAmount} for ${item.studentName} (${item.gradeSubject}), which is now ${item.maxOverdueDays} days overdue (originally due on ${item.oldestOverdueDueDate}).${promiseNote}

We kindly request you to clear this pending amount by today to maintain active batch attendance and regular access to test evaluations.

Payment Details:
• Instant UPI: ${upiId}
• Account: Sharma Maths Academy | HDFC Bank

Please share a screenshot of the payment receipt once completed. We appreciate your immediate attention to this matter.

Regards,
${ownerName}
Director, ${businessName}`;

  return { friendly, polite, firm };
}

/**
 * Builds a direct WhatsApp click-to-chat URL with prefilled URL-encoded message.
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
