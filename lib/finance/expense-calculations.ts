/**
 * Precision-safe financial calculation utilities for bills and operational expenses.
 * Uses integer paise internally to avoid JavaScript floating point arithmetic errors.
 */

import { SampleBill, ExpenseCategory } from "@/lib/sample-data";

export interface ExpenseMetrics {
  totalThisMonth: number;
  upcomingExpenses: number;
  overdueExpenses: number;
  paidThisMonth: number;
  totalPaidAllTime: number;
  recurringMonthlyProjection: number;
  upcomingCount: number;
  overdueCount: number;
  paidCount: number;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Rent",
  "Electricity",
  "Internet",
  "Salary/Honorarium",
  "Materials",
  "Software",
  "Other",
];

/**
 * Calculates precision-safe expense metrics for the current planning period.
 */
export function calculateExpenseMetrics(
  bills: SampleBill[],
  asOfDate: string = "2026-11-21"
): ExpenseMetrics {
  let paidThisMonthPaise = 0;
  let totalPaidAllTimePaise = 0;
  let upcomingExpensesPaise = 0;
  let overdueExpensesPaise = 0;
  let recurringMonthlyProjectionPaise = 0;

  let upcomingCount = 0;
  let overdueCount = 0;
  let paidCount = 0;

  const currentMonthPrefix = asOfDate.slice(0, 7); // e.g. "2026-11"

  bills.forEach((bill) => {
    const amountPaise = Math.round((Number(bill.amount) || 0) * 100);

    // Paid bills calculation
    if (bill.status === "paid") {
      totalPaidAllTimePaise += amountPaise;
      paidCount += 1;
      const isPaidThisMonth =
        (bill.paidDate && bill.paidDate.startsWith(currentMonthPrefix)) ||
        (!bill.paidDate && bill.dueDate.startsWith(currentMonthPrefix));
      if (isPaidThisMonth) {
        paidThisMonthPaise += amountPaise;
      }
    } else {
      // Unpaid bills: check if overdue or upcoming relative to asOfDate
      const isOverdue = bill.status === "overdue" || bill.dueDate < asOfDate;
      if (isOverdue) {
        overdueExpensesPaise += amountPaise;
        overdueCount += 1;
      } else {
        upcomingExpensesPaise += amountPaise;
        upcomingCount += 1;
      }
    }

    // Recurring run-rate calculation
    if (bill.isRecurring && !bill.isGeneratedOccurrence) {
      if (bill.recurringFrequency === "monthly" || !bill.recurringFrequency) {
        recurringMonthlyProjectionPaise += amountPaise;
      } else if (bill.recurringFrequency === "quarterly") {
        recurringMonthlyProjectionPaise += Math.round(amountPaise / 3);
      } else if (bill.recurringFrequency === "yearly") {
        recurringMonthlyProjectionPaise += Math.round(amountPaise / 12);
      }
    }
  });

  // Total expenses this month = paid this month + (unpaid due this month)
  let unpaidThisMonthPaise = 0;
  bills.forEach((bill) => {
    if (bill.status !== "paid" && bill.dueDate.startsWith(currentMonthPrefix)) {
      unpaidThisMonthPaise += Math.round((Number(bill.amount) || 0) * 100);
    }
  });

  const totalThisMonthPaise = paidThisMonthPaise + unpaidThisMonthPaise;

  return {
    totalThisMonth: totalThisMonthPaise / 100,
    upcomingExpenses: upcomingExpensesPaise / 100,
    overdueExpenses: overdueExpensesPaise / 100,
    paidThisMonth: paidThisMonthPaise / 100,
    totalPaidAllTime: totalPaidAllTimePaise / 100,
    recurringMonthlyProjection: recurringMonthlyProjectionPaise / 100,
    upcomingCount,
    overdueCount,
    paidCount,
  };
}

/**
 * Projects future recurring bill occurrences without duplicating on every render.
 * Generates next scheduled dates within the planning horizon (default 45 days).
 */
export function generateRecurringOccurrences(
  bills: SampleBill[],
  horizonDays: number = 45,
  asOfDate: string = "2026-11-21"
): SampleBill[] {
  const asOf = new Date(asOfDate);
  const horizonEnd = new Date(asOf.getTime() + horizonDays * 86400000);
  const horizonEndStr = horizonEnd.toISOString().slice(0, 10);

  const newOccurrences: SampleBill[] = [];

  bills
    .filter((b) => b.isRecurring && !b.isGeneratedOccurrence)
    .forEach((baseBill) => {
      // Calculate next scheduled occurrence
      const baseDate = new Date(baseBill.dueDate);
      const nextDate = new Date(baseDate);

      if (baseBill.recurringFrequency === "quarterly") {
        nextDate.setMonth(nextDate.getMonth() + 3);
      } else if (baseBill.recurringFrequency === "yearly") {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      } else {
        // default monthly
        nextDate.setMonth(nextDate.getMonth() + 1);
      }

      const nextDateStr = nextDate.toISOString().slice(0, 10);

      // Verify next occurrence is within horizon and before recurringEndDate
      const isWithinHorizon = nextDateStr >= asOfDate && nextDateStr <= horizonEndStr;
      const isBeforeEndDate =
        !baseBill.recurringEndDate || nextDateStr <= baseBill.recurringEndDate;

      // Check if a bill with same title and date already exists
      const existsAlready = bills.some(
        (b) => b.title === baseBill.title && b.dueDate === nextDateStr
      );

      if (isWithinHorizon && isBeforeEndDate && !existsAlready) {
        newOccurrences.push({
          ...baseBill,
          id: `sched-${baseBill.id}-${nextDateStr}`,
          dueDate: nextDateStr,
          status: "unpaid",
          paidDate: undefined,
          paymentReference: undefined,
          isGeneratedOccurrence: true,
          notes: `Projected next cycle occurrence for ${baseBill.title}`,
        });
      }
    });

  return newOccurrences;
}

/**
 * Validates new expense form data before submission.
 */
export function validateExpenseForm(data: {
  title: string;
  vendorName: string;
  category: string;
  amount: number;
  dueDate: string;
  isRecurring: boolean;
  recurringEndDate?: string;
}): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.title || !data.title.trim()) {
    errors.title = "Expense description is required.";
  }

  if (!data.vendorName || !data.vendorName.trim()) {
    errors.vendorName = "Vendor or payee name is required.";
  }

  if (!data.category) {
    errors.category = "Please select an expense category.";
  }

  if (!data.amount || Number(data.amount) <= 0) {
    errors.amount = "Expense amount must be greater than zero.";
  }

  if (!data.dueDate) {
    errors.dueDate = "Due date is required.";
  }

  if (data.isRecurring && data.recurringEndDate && data.dueDate) {
    if (data.recurringEndDate < data.dueDate) {
      errors.recurringEndDate = "Recurrence end date cannot be earlier than the first due date.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
