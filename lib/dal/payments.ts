import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/formatters';

type DbClient = Awaited<ReturnType<typeof createClient>>;

export type PaymentMode = 'upi' | 'cash' | 'bank_transfer' | 'cheque' | 'other';

export interface PaymentRawRow {
  id: string;
  business_id: string;
  invoice_id: string;
  customer_id: string;
  amount: number | string;
  payment_date: string;
  payment_mode: PaymentMode;
  reference_id?: string | null;
  receipt_image_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  businessId: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  amountPaise: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  referenceId: string;
  receiptImageUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Joined relations
  customerName: string;
  customerGrade: string;
  parentName: string;
  parentPhone: string;
  invoiceNumber: string;
  receiptNumber: string;
}

export interface PaymentSummaryMetrics {
  totalCollected: number;
  totalCollectedPaise: number;
  paymentCount: number;
  cashCollected: number;
  upiCollected: number;
  bankTransferCollected: number;
  chequeCollected: number;
  otherCollected: number;
  todayCollected: number;
  thisMonthCollected: number;
}

export const RecordPaymentSchema = z.object({
  invoiceId: z.string().uuid('Invalid invoice ID format.'),
  amount: z.number().positive('Payment amount must be greater than zero.'),
  paymentMode: z.enum(['upi', 'cash', 'bank_transfer', 'cheque', 'other'], {
    errorMap: () => ({ message: 'Payment mode must be UPI, Cash, Bank Transfer, Cheque, or Other.' }),
  }),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in YYYY-MM-DD format.'),
  referenceId: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  receiptImageUrl: z.string().url().optional().nullable(),
});

export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

export interface RecordPaymentResult {
  success: boolean;
  paymentId: string;
  invoiceId: string;
  amountPaid: number;
  balanceDue: number;
  status: string;
}

/**
 * Maps a database payment row and joined relations to a typed PaymentRecord.
 * Computes integer paise to guarantee zero floating-point arithmetic errors.
 */
export function mapPaymentRow(
  payment: PaymentRawRow,
  customer?: { name: string; grade_subject: string | null; parent_name: string | null; phone: string } | null,
  invoice?: { invoice_number: string } | null
): PaymentRecord {
  const amountNumber = Number(payment.amount ?? 0);
  const amountPaise = Math.round(amountNumber * 100);
  const amount = amountPaise / 100;

  const year = payment.payment_date ? payment.payment_date.slice(0, 4) : new Date().getFullYear().toString();
  const rawIdSuffix = payment.id.replace(/\D/g, '').slice(-4) || payment.id.slice(0, 4).toUpperCase();
  const receiptNumber = `REC-${year}-${rawIdSuffix}`;

  return {
    id: payment.id,
    businessId: payment.business_id,
    invoiceId: payment.invoice_id,
    customerId: payment.customer_id,
    amount,
    amountPaise,
    paymentDate: String(payment.payment_date).slice(0, 10),
    paymentMode: payment.payment_mode,
    referenceId: payment.reference_id || '—',
    receiptImageUrl: payment.receipt_image_url || undefined,
    notes: payment.notes || undefined,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at,
    customerName: customer?.name || 'Unknown Student',
    customerGrade: customer?.grade_subject || 'General Batch',
    parentName: customer?.parent_name || '',
    parentPhone: customer?.phone || '',
    invoiceNumber: invoice?.invoice_number || 'INV-UNKNOWN',
    receiptNumber,
  };
}

/**
 * Fetches payments strictly scoped to the authenticated tutor's business.
 * Resolves customer names, tuition batch, and invoice numbers.
 */
export async function getPayments(
  supabase: DbClient,
  businessId: string,
  options?: {
    customerId?: string;
    invoiceId?: string;
    paymentMode?: PaymentMode;
    startDate?: string;
    endDate?: string;
    search?: string;
  }
): Promise<PaymentRecord[]> {
  let query = supabase
    .from('payments')
    .select('*')
    .eq('business_id', businessId);

  if (options?.customerId) {
    query = query.eq('customer_id', options.customerId);
  }

  if (options?.invoiceId) {
    query = query.eq('invoice_id', options.invoiceId);
  }

  if (options?.paymentMode) {
    query = query.eq('payment_mode', options.paymentMode);
  }

  if (options?.startDate) {
    query = query.gte('payment_date', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('payment_date', options.endDate);
  }

  query = query.order('payment_date', { ascending: false }).order('created_at', { ascending: false });

  const { data: paymentRows, error: payError } = await query;
  if (payError) {
    throw new Error(`Failed to load payment records: ${payError.message}`);
  }

  if (!paymentRows || paymentRows.length === 0) {
    return [];
  }

  // Fetch associated customers
  const customerIds = Array.from(new Set((paymentRows as PaymentRawRow[]).map((p) => p.customer_id)));
  const { data: customerRows } = await supabase
    .from('customers')
    .select('id, name, grade_subject, parent_name, phone')
    .in('id', customerIds);

  const customerMap = new Map<string, { name: string; grade_subject: string | null; parent_name: string | null; phone: string }>();
  if (customerRows) {
    for (const c of customerRows) {
      customerMap.set(c.id, c);
    }
  }

  // Fetch associated invoices
  const invoiceIds = Array.from(new Set((paymentRows as PaymentRawRow[]).map((p) => p.invoice_id)));
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .in('id', invoiceIds);

  const invoiceMap = new Map<string, { invoice_number: string }>();
  if (invoiceRows) {
    for (const inv of invoiceRows) {
      invoiceMap.set(inv.id, inv);
    }
  }

  let mappedPayments = (paymentRows as PaymentRawRow[]).map((row) =>
    mapPaymentRow(row, customerMap.get(row.customer_id), invoiceMap.get(row.invoice_id))
  );

  // Apply search filtering on student name, invoice number, parent, or reference
  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    mappedPayments = mappedPayments.filter(
      (p) =>
        p.customerName.toLowerCase().includes(q) ||
        p.invoiceNumber.toLowerCase().includes(q) ||
        p.receiptNumber.toLowerCase().includes(q) ||
        p.referenceId.toLowerCase().includes(q) ||
        p.parentName.toLowerCase().includes(q)
    );
  }

  return mappedPayments;
}

/**
 * Fetches a single payment by ID with relations.
 */
export async function getPaymentById(
  supabase: DbClient,
  businessId: string,
  paymentId: string
): Promise<PaymentRecord | null> {
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !payment) {
    return null;
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, grade_subject, parent_name, phone')
    .eq('id', payment.customer_id)
    .single();

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('id', payment.invoice_id)
    .single();

  return mapPaymentRow(payment as PaymentRawRow, customer, invoice);
}

/**
 * Fetches all payments associated with a specific invoice.
 */
export async function getPaymentsByInvoiceId(
  supabase: DbClient,
  businessId: string,
  invoiceId: string
): Promise<PaymentRecord[]> {
  return getPayments(supabase, businessId, { invoiceId });
}

/**
 * Fetches all payments associated with a specific student.
 */
export async function getPaymentsByCustomerId(
  supabase: DbClient,
  businessId: string,
  customerId: string
): Promise<PaymentRecord[]> {
  return getPayments(supabase, businessId, { customerId });
}

/**
 * Computes payment summary metrics in integer paise strictly from stored payment records.
 */
export async function getPaymentSummaryMetrics(
  supabase: DbClient,
  businessId: string
): Promise<PaymentSummaryMetrics> {
  const payments = await getPayments(supabase, businessId);

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7); // YYYY-MM

  let totalPaise = 0;
  let cashPaise = 0;
  let upiPaise = 0;
  let bankTransferPaise = 0;
  let chequePaise = 0;
  let otherPaise = 0;
  let todayPaise = 0;
  let monthPaise = 0;

  for (const p of payments) {
    const paise = p.amountPaise;
    totalPaise += paise;

    switch (p.paymentMode) {
      case 'cash':
        cashPaise += paise;
        break;
      case 'upi':
        upiPaise += paise;
        break;
      case 'bank_transfer':
        bankTransferPaise += paise;
        break;
      case 'cheque':
        chequePaise += paise;
        break;
      case 'other':
      default:
        otherPaise += paise;
        break;
    }

    if (p.paymentDate === todayStr) {
      todayPaise += paise;
    }

    if (p.paymentDate.startsWith(currentMonthStr)) {
      monthPaise += paise;
    }
  }

  return {
    totalCollected: totalPaise / 100,
    totalCollectedPaise: totalPaise,
    paymentCount: payments.length,
    cashCollected: cashPaise / 100,
    upiCollected: upiPaise / 100,
    bankTransferCollected: bankTransferPaise / 100,
    chequeCollected: chequePaise / 100,
    otherCollected: otherPaise / 100,
    todayCollected: todayPaise / 100,
    thisMonthCollected: monthPaise / 100,
  };
}

/**
 * Records a payment against an invoice using the secure database RPC public.record_invoice_payment().
 * Performs pre-flight financial validation in integer paise to avoid precision loss.
 */
export async function recordInvoicePayment(
  supabase: DbClient,
  businessId: string,
  input: RecordPaymentInput
): Promise<RecordPaymentResult> {
  const validated = RecordPaymentSchema.parse(input);

  // 1. Pre-flight verification: Query invoice to verify ownership, status, and balance
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('id, business_id, customer_id, total_amount, amount_paid, balance_due, status, deleted_at, invoice_number')
    .eq('id', validated.invoiceId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (invError || !invoice) {
    throw new Error('Invoice not found or does not belong to your business.');
  }

  if (invoice.deleted_at !== null) {
    throw new Error(`Cannot record payment: Invoice ${invoice.invoice_number} has been archived or cancelled.`);
  }

  if (invoice.status === 'cancelled') {
    throw new Error(`Cannot record payment: Invoice ${invoice.invoice_number} is cancelled.`);
  }

  if (invoice.status === 'draft') {
    throw new Error(
      `Cannot record payment: Invoice ${invoice.invoice_number} is in draft status. Please finalize and mark as 'sent' first.`
    );
  }

  // 2. Financial validation in integer paise
  const balancePaise = Math.round(Number(invoice.balance_due) * 100);
  const paymentPaise = Math.round(validated.amount * 100);

  if (balancePaise <= 0 || invoice.status === 'paid') {
    throw new Error(`Invoice ${invoice.invoice_number} is already fully paid.`);
  }

  if (paymentPaise <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  if (paymentPaise > balancePaise) {
    throw new Error(
      `Payment amount (${formatINR(validated.amount)}) exceeds remaining invoice balance due (${formatINR(balancePaise / 100)}).`
    );
  }

  // 3. Call secure database RPC public.record_invoice_payment()
  const { data: rpcData, error: rpcError } = await supabase.rpc('record_invoice_payment', {
    p_invoice_id: validated.invoiceId,
    p_amount: validated.amount,
    p_payment_mode: validated.paymentMode,
    p_payment_date: validated.paymentDate,
    p_reference_id: validated.referenceId || null,
    p_notes: validated.notes || null,
    p_receipt_image_url: validated.receiptImageUrl || null,
  });

  if (rpcError) {
    throw new Error(`Payment processing failed: ${rpcError.message}`);
  }

  const result = rpcData as {
    success: boolean;
    payment_id: string;
    invoice_id: string;
    amount_paid: number;
    balance_due: number;
    status: string;
  };

  return {
    success: true,
    paymentId: result.payment_id,
    invoiceId: result.invoice_id,
    amountPaid: Number(result.amount_paid),
    balanceDue: Number(result.balance_due),
    status: result.status,
  };
}
