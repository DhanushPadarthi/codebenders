/**
 * Precision-safe financial calculation utilities for invoice line items and totals.
 * Uses integer paise internally to avoid JavaScript floating point arithmetic errors.
 */

export interface LineItemInput {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CalculatedInvoiceTotals {
  subtotal: number;
  discount: number;
  totalAmount: number;
  balanceDue: number;
}

export const INVOICE_ITEM_PRESETS = [
  { label: "Monthly Tuition Fee", defaultPrice: 7500, defaultQty: 1 },
  { label: "Study Materials & Modules", defaultPrice: 1500, defaultQty: 1 },
  { label: "Board / Competitive Test Series", defaultPrice: 2000, defaultQty: 1 },
  { label: "Extra Doubt Clearing Sessions", defaultPrice: 1000, defaultQty: 1 },
  { label: "Lab / Practical Exam Materials", defaultPrice: 1200, defaultQty: 1 },
  { label: "Custom Item", defaultPrice: 0, defaultQty: 1 },
];

/**
 * Calculates line total in integer paise and returns decimal rupees.
 */
export function calculateLineTotal(quantity: number, unitPrice: number): number {
  const safeQty = Math.max(0, Number(quantity) || 0);
  const safePrice = Math.max(0, Number(unitPrice) || 0);
  
  // Convert unit price to paise (1 INR = 100 paise)
  const pricePaise = Math.round(safePrice * 100);
  
  // Total paise = safeQty * pricePaise
  const totalPaise = Math.round(safeQty * pricePaise);
  
  return totalPaise / 100;
}

/**
 * Calculates subtotal, discount, total amount, and balance due.
 * Total amount = max(0, Subtotal - Discount)
 * Balance due = Total amount - Amount paid
 */
export function calculateInvoiceTotals(
  items: { quantity: number; unitPrice: number }[],
  discount: number = 0,
  amountPaid: number = 0
): CalculatedInvoiceTotals {
  // Sum item totals in paise
  const subtotalPaise = items.reduce((sum, item) => {
    const itemTotalPaise = Math.round(
      Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0) * 100
    );
    return sum + itemTotalPaise;
  }, 0);

  // Discount in paise, bounded between 0 and subtotal
  const rawDiscountPaise = Math.max(0, Math.round((Number(discount) || 0) * 100));
  const effectiveDiscountPaise = Math.min(subtotalPaise, rawDiscountPaise);

  // Total amount in paise = max(0, Subtotal - Discount)
  const totalAmountPaise = Math.max(0, subtotalPaise - effectiveDiscountPaise);

  // Amount paid in paise
  const amountPaidPaise = Math.max(0, Math.round((Number(amountPaid) || 0) * 100));

  // Balance due in paise = max(0, Total amount - Amount paid)
  const balanceDuePaise = Math.max(0, totalAmountPaise - amountPaidPaise);

  return {
    subtotal: subtotalPaise / 100,
    discount: effectiveDiscountPaise / 100,
    totalAmount: totalAmountPaise / 100,
    balanceDue: balanceDuePaise / 100,
  };
}

/**
 * Validates invoice form inputs before drafting or finalizing.
 */
export function validateInvoiceForm(data: {
  customerId: string;
  issueDate: string;
  dueDate: string;
  items: LineItemInput[];
  discount: number;
}): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.customerId || !data.customerId.trim()) {
    errors.customerId = "Please select a student.";
  }

  if (!data.issueDate) {
    errors.issueDate = "Issue date is required.";
  }

  if (!data.dueDate) {
    errors.dueDate = "Due date is required.";
  } else if (data.issueDate && data.dueDate < data.issueDate) {
    errors.dueDate = "Due date cannot be earlier than the issue date.";
  }

  if (!data.items || data.items.length === 0) {
    errors.items = "At least one line item is required.";
  } else {
    data.items.forEach((item, index) => {
      if (!item.description || !item.description.trim()) {
        errors[`item_${index}_desc`] = `Item #${index + 1} description is required.`;
      }
      if (item.quantity <= 0) {
        errors[`item_${index}_qty`] = `Item #${index + 1} quantity must be greater than zero.`;
      }
      if (item.unitPrice < 0) {
        errors[`item_${index}_price`] = `Item #${index + 1} unit price cannot be negative.`;
      }
    });
  }

  if (data.discount < 0) {
    errors.discount = "Discount cannot be negative.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface PaymentValidationResult {
  isValid: boolean;
  error?: string;
  newAmountPaid?: number;
  newBalanceDue?: number;
  newStatus?: "paid" | "partially_paid" | "overdue";
  isOverdue?: boolean;
  hasPartialPayment?: boolean;
}

/**
 * Calculates real-time effective status matching the PostgreSQL get_invoice_effective_status function.
 * If due date has passed and balance > 0, effective status is ALWAYS overdue,
 * while partial payment information is preserved separately.
 */
export function getInvoiceEffectiveStatus(
  status: string,
  dueDate: string,
  amountPaid: number,
  totalAmount: number,
  asOfDate: string = "2026-11-21"
): "paid" | "overdue" | "partially_paid" | "sent" | "draft" | "cancelled" {
  if (status === "cancelled") return "cancelled";
  if (amountPaid >= totalAmount) return "paid";
  if (status === "draft") return "draft";
  if (asOfDate > dueDate) return "overdue";
  if (amountPaid > 0) return "partially_paid";
  return "sent";
}

/**
 * Validates a proposed payment against invoice business rules and returns new balances.
 * Operates purely in integer paise to avoid rounding discrepancies.
 * If an overdue invoice receives a partial payment, it remains overdue in effective status.
 */
export function validatePaymentCalculation(
  invoice: {
    id: string;
    customerId?: string;
    status: string;
    dueDate?: string;
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
    invoiceNumber: string;
  },
  customerId: string,
  paymentAmount: number,
  asOfDate: string = "2026-11-21"
): PaymentValidationResult {
  // Rule 1: Invoice customer match
  if (invoice.customerId && customerId && invoice.customerId !== customerId) {
    return {
      isValid: false,
      error: `Invoice ${invoice.invoiceNumber} does not belong to the selected student.`,
    };
  }

  // Rule 2: Cannot pay on draft invoices
  if (invoice.status === "draft") {
    return {
      isValid: false,
      error: `Invoice ${invoice.invoiceNumber} is still a Draft. Please issue (mark as Sent) the invoice before recording payments.`,
    };
  }

  // Rule 3: Cannot pay on cancelled invoices
  if (invoice.status === "cancelled") {
    return {
      isValid: false,
      error: `Invoice ${invoice.invoiceNumber} is Cancelled and cannot receive payments.`,
    };
  }

  // Rule 4: Cannot pay on already fully paid invoices
  if (invoice.status === "paid" || invoice.balanceDue <= 0) {
    return {
      isValid: false,
      error: `Invoice ${invoice.invoiceNumber} is already fully paid. Balance due is ₹0.`,
    };
  }

  // Convert to integer paise
  const paymentPaise = Math.round((Number(paymentAmount) || 0) * 100);
  const balanceDuePaise = Math.round(Number(invoice.balanceDue) * 100);
  const totalAmountPaise = Math.round(Number(invoice.totalAmount) * 100);
  const currentPaidPaise = Math.round(Number(invoice.amountPaid) * 100);

  // Rule 5: Payment amount must be greater than zero
  if (paymentPaise <= 0) {
    return {
      isValid: false,
      error: "Payment amount must be greater than zero.",
    };
  }

  // Rule 6: Payment cannot exceed remaining invoice balance (no overpayment)
  if (paymentPaise > balanceDuePaise) {
    return {
      isValid: false,
      error: `Payment amount (₹${(paymentPaise / 100).toLocaleString("en-IN")}) exceeds remaining balance (₹${(balanceDuePaise / 100).toLocaleString("en-IN")}).`,
    };
  }

  // Calculate new balances in integer paise
  const newAmountPaidPaise = currentPaidPaise + paymentPaise;
  const newBalanceDuePaise = Math.max(0, totalAmountPaise - newAmountPaidPaise);

  let newStatus: "paid" | "partially_paid" | "overdue";
  let isOverdue = false;
  let hasPartialPayment = false;

  if (newBalanceDuePaise === 0) {
    newStatus = "paid";
    isOverdue = false;
    hasPartialPayment = false;
  } else {
    hasPartialPayment = newAmountPaidPaise > 0;
    const isPastDue = Boolean(invoice.dueDate && asOfDate > invoice.dueDate);
    if (isPastDue) {
      newStatus = "overdue";
      isOverdue = true;
    } else {
      newStatus = "partially_paid";
      isOverdue = false;
    }
  }

  return {
    isValid: true,
    newAmountPaid: newAmountPaidPaise / 100,
    newBalanceDue: newBalanceDuePaise / 100,
    newStatus,
    isOverdue,
    hasPartialPayment,
  };
}
