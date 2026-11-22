import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCustomers, type CustomerRecord } from '@/lib/dal/customers';
import { getInvoices, type InvoiceRecord } from '@/lib/dal/invoices';
import { getPayments, type PaymentRecord } from '@/lib/dal/payments';
import {
  buildRecoveryQueue,
  computeRecoveryStats,
  type CustomerRecoveryItem,
  type RecoveryQueueDashboardStats,
} from '@/lib/finance/recovery-scoring';
import type {
  SampleInvoice,
  SampleCustomer,
  SamplePaymentPromise,
  RecoveryFollowUp,
  FollowUpOutcome,
  FollowUpTone,
  SampleInvoiceStatus,
} from '@/lib/sample-data';

type DbClient = Awaited<ReturnType<typeof createClient>>;

export interface PaymentPromiseRawRow {
  id: string;
  business_id: string;
  customer_id: string;
  invoice_id: string | null;
  raw_message: string;
  promised_amount: number | string;
  promised_date: string;
  status: 'pending' | 'fulfilled' | 'broken' | 'cancelled';
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentPromiseRecord {
  id: string;
  businessId: string;
  customerId: string;
  invoiceId?: string;
  rawMessage: string;
  promisedAmount: number;
  promisedAmountPaise: number;
  promisedDate: string;
  status: 'pending' | 'fulfilled' | 'broken' | 'cancelled';
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpTaskRawRow {
  id: string;
  business_id: string;
  customer_id: string;
  invoice_id: string | null;
  priority_score: number | string;
  priority_level: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string;
  status: 'pending' | 'completed' | 'dismissed';
  last_reminder_tone: 'friendly' | 'professional' | 'firm' | 'urgent' | null;
  last_reminder_text: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpTaskRecord {
  id: string;
  businessId: string;
  customerId: string;
  invoiceId?: string;
  priorityScore: number;
  priorityLevel: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string;
  status: 'pending' | 'completed' | 'dismissed';
  tone?: 'friendly' | 'polite' | 'firm';
  outcome: FollowUpOutcome;
  notes: string;
  lastContactedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryQueueData {
  items: CustomerRecoveryItem[];
  stats: RecoveryQueueDashboardStats;
  customers: CustomerRecord[];
  invoices: InvoiceRecord[];
  promises: PaymentPromiseRecord[];
  followUps: RecoveryFollowUp[];
  payments: PaymentRecord[];
  businessProfile: {
    businessName: string;
    ownerName: string;
    upiId: string;
  };
  asOfDate: string;
}

// Zod Schemas
export const CreatePaymentPromiseSchema = z.object({
  customerId: z.string().uuid('Valid customer ID is required'),
  invoiceId: z.string().uuid().optional().nullable(),
  rawMessage: z.string().trim().min(1, 'Promise note or explanation is required').max(500),
  promisedAmount: z.number().positive('Promised amount must be greater than zero'),
  promisedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date YYYY-MM-DD required'),
  status: z.enum(['pending', 'fulfilled', 'broken', 'cancelled']).default('pending'),
  confidenceScore: z.number().min(0).max(1).optional().default(0.85),
});

export type CreatePaymentPromiseInput = z.infer<typeof CreatePaymentPromiseSchema>;

export const UpdatePaymentPromiseSchema = z.object({
  promiseId: z.string().uuid('Valid promise ID required'),
  status: z.enum(['pending', 'fulfilled', 'broken', 'cancelled']),
});

export type UpdatePaymentPromiseInput = z.infer<typeof UpdatePaymentPromiseSchema>;

export const UpdatePaymentPromiseDetailsSchema = z.object({
  promiseId: z.string().uuid('Valid promise ID required'),
  invoiceId: z.string().uuid().optional().nullable(),
  promisedAmount: z.number().positive().optional(),
  status: z.enum(['pending', 'fulfilled', 'broken', 'cancelled']).optional(),
});

export type UpdatePaymentPromiseDetailsInput = z.infer<typeof UpdatePaymentPromiseDetailsSchema>;

export const CreateFollowUpTaskSchema = z.object({
  customerId: z.string().uuid('Valid customer ID is required'),
  invoiceId: z.string().uuid().optional().nullable(),
  priorityScore: z.number().min(0).max(100).optional().default(0),
  priorityLevel: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pending', 'completed', 'dismissed']).optional().default('pending'),
  tone: z.enum(['friendly', 'polite', 'firm']).optional(),
  outcome: z.enum([
    'reminder_prepared',
    'contacted',
    'promised_payment',
    'no_response',
    'extension_requested',
    'payment_received',
  ]).optional().default('contacted'),
  notes: z.string().trim().max(1000).optional().default(''),
  contactedAt: z.string().optional(),
});

export type CreateFollowUpTaskInput = z.input<typeof CreateFollowUpTaskSchema>;

export const UpdateFollowUpTaskSchema = z.object({
  taskId: z.string().uuid('Valid task ID required'),
  status: z.enum(['pending', 'completed', 'dismissed']),
});

export type UpdateFollowUpTaskInput = z.infer<typeof UpdateFollowUpTaskSchema>;

/**
 * Maps DB tone enum to UI tone
 */
function dbToneToUiTone(tone: string | null): FollowUpTone | undefined {
  if (!tone) return undefined;
  if (tone === 'professional') return 'polite';
  if (tone === 'urgent') return 'firm';
  if (tone === 'friendly' || tone === 'firm') return tone;
  return undefined;
}

/**
 * Maps UI tone to DB tone enum ('friendly' | 'professional' | 'firm' | 'urgent')
 */
function uiToneToDbTone(tone?: FollowUpTone): 'friendly' | 'professional' | 'firm' | null {
  if (!tone) return null;
  if (tone === 'polite') return 'professional';
  return tone;
}

/**
 * Decodes outcome and user notes from DB last_reminder_text
 */
function decodeFollowUpNotes(text: string | null): { outcome: FollowUpOutcome; notes: string } {
  if (!text) return { outcome: 'contacted', notes: '' };
  const match = text.match(/^\[outcome:\s*([a-z_]+)\]\s*([\s\S]*)$/);
  if (match) {
    const rawOutcome = match[1] as FollowUpOutcome;
    const validOutcomes: FollowUpOutcome[] = [
      'reminder_prepared',
      'contacted',
      'promised_payment',
      'no_response',
      'extension_requested',
      'payment_received',
    ];
    if (validOutcomes.includes(rawOutcome)) {
      return { outcome: rawOutcome, notes: match[2].trim() };
    }
  }
  return { outcome: 'contacted', notes: text.trim() };
}

/**
 * Encodes outcome into DB last_reminder_text
 */
function encodeFollowUpNotes(outcome: FollowUpOutcome, notes: string): string {
  return `[outcome:${outcome}] ${notes.trim()}`;
}

/**
 * Fetches active payment promises for the business.
 */
export async function getPaymentPromises(
  supabase: DbClient,
  businessId: string
): Promise<PaymentPromiseRecord[]> {
  const { data, error } = await supabase
    .from('payment_promises')
    .select('*')
    .eq('business_id', businessId)
    .order('promised_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to retrieve payment promises: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  return (data as PaymentPromiseRawRow[]).map((row) => {
    const amount = Number(row.promised_amount ?? 0);
    const amountPaise = Math.round(amount * 100);
    return {
      id: row.id,
      businessId: row.business_id,
      customerId: row.customer_id,
      invoiceId: row.invoice_id || undefined,
      rawMessage: row.raw_message,
      promisedAmount: amountPaise / 100,
      promisedAmountPaise: amountPaise,
      promisedDate: row.promised_date,
      status: row.status,
      confidenceScore: Number(row.confidence_score ?? 0.85),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Creates a payment promise with customer & invoice integrity validation.
 */
export async function createPaymentPromise(
  supabase: DbClient,
  businessId: string,
  input: CreatePaymentPromiseInput
): Promise<PaymentPromiseRecord> {
  const validated = CreatePaymentPromiseSchema.parse(input);

  // 1. Verify customer belongs to this business
  const { data: customer, error: errCust } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', businessId)
    .eq('id', validated.customerId)
    .maybeSingle();

  if (errCust || !customer) {
    throw new Error('Customer does not belong to your business.');
  }

  // 2. If invoiceId provided, verify invoice belongs to customer & business, and check balance_due
  if (validated.invoiceId) {
    const { data: inv, error: errInv } = await supabase
      .from('invoices')
      .select('id, balance_due, status')
      .eq('business_id', businessId)
      .eq('customer_id', validated.customerId)
      .eq('id', validated.invoiceId)
      .maybeSingle();

    if (errInv || !inv) {
      throw new Error('Invoice does not exist or does not belong to this student.');
    }

    const currentBalanceDue = Number(inv.balance_due ?? 0);
    if (validated.promisedAmount > currentBalanceDue + 0.01) {
      throw new Error(
        `Promised amount (₹${validated.promisedAmount.toFixed(2)}) cannot exceed remaining invoice balance (₹${currentBalanceDue.toFixed(2)}).`
      );
    }
  }

  // 3. If inserting directly with status === 'fulfilled', verify genuine payment satisfaction
  if (validated.status === 'fulfilled') {
    if (!validated.invoiceId) {
      throw new Error(
        'Cannot create unlinked promise as fulfilled: Under the current schema, a payment promise must be linked to a specific invoice with verified payment records to confirm fulfilment.'
      );
    }

    const { data: payments, error: errPay } = await supabase
      .from('payments')
      .select('id, amount, payment_date, created_at')
      .eq('business_id', businessId)
      .eq('invoice_id', validated.invoiceId);

    if (errPay || !payments || payments.length === 0) {
      throw new Error(
        'Cannot create promise as fulfilled: No recorded payment exists for this invoice. Payments must be recorded through record_invoice_payment().'
      );
    }

    const totalPaidPaise = payments.reduce(
      (sum, p) => sum + Math.round(Number(p.amount) * 100),
      0
    );
    const promisedPaise = Math.round(validated.promisedAmount * 100);

    const { data: inv } = await supabase
      .from('invoices')
      .select('balance_due')
      .eq('business_id', businessId)
      .eq('id', validated.invoiceId)
      .single();

    const balanceDuePaise = Math.round(Number(inv?.balance_due ?? 0) * 100);

    if (totalPaidPaise < promisedPaise && balanceDuePaise > 0) {
      const paidINR = (totalPaidPaise / 100).toFixed(2);
      const promisedINR = validated.promisedAmount.toFixed(2);
      const balanceINR = (balanceDuePaise / 100).toFixed(2);
      throw new Error(
        `Cannot create promise as fulfilled: Recorded payments (₹${paidINR}) are less than promised amount (₹${promisedINR}) and remaining invoice balance is ₹${balanceINR}.`
      );
    }
  }

  // 4. Insert promise into PostgreSQL
  const { data, error } = await supabase
    .from('payment_promises')
    .insert({
      business_id: businessId,
      customer_id: validated.customerId,
      invoice_id: validated.invoiceId || null,
      raw_message: validated.rawMessage,
      promised_amount: validated.promisedAmount,
      promised_date: validated.promisedDate,
      status: validated.status,
      confidence_score: validated.confidenceScore,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create payment promise: ${error?.message || 'Database error'}`);
  }

  const row = data as PaymentPromiseRawRow;
  const amount = Number(row.promised_amount ?? 0);
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id || undefined,
    rawMessage: row.raw_message,
    promisedAmount: amount,
    promisedAmountPaise: Math.round(amount * 100),
    promisedDate: row.promised_date,
    status: row.status,
    confidenceScore: Number(row.confidence_score ?? 0.85),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Updates a payment promise status (pending | fulfilled | broken | cancelled).
 * STRICT DATA INTEGRITY:
 * A promise can NEVER be marked 'fulfilled' without verifying against real payment records in PostgreSQL.
 * Payment records and invoice balances are queried to establish satisfaction:
 * 1. An unlinked promise (no invoice_id) cannot be marked fulfilled (limitation of schema).
 * 2. An invoice with no payments recorded cannot fulfill a promise.
 * 3. Partial payments that do not cover the promised amount (and leave a balance due) cannot fulfill a promise.
 * 4. Only recorded payments >= promised amount or total invoice clearance can fulfill a promise.
 * Legitimate 'broken', 'cancelled', and 'pending' transitions remain unrestricted.
 */
export async function updatePaymentPromiseStatus(
  supabase: DbClient,
  businessId: string,
  promiseId: string,
  status: 'pending' | 'fulfilled' | 'broken' | 'cancelled'
): Promise<PaymentPromiseRecord> {
  // 1. Fetch target promise and verify ownership
  const { data: existingPromise, error: errFetch } = await supabase
    .from('payment_promises')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', promiseId)
    .maybeSingle();

  if (errFetch || !existingPromise) {
    throw new Error(`Payment promise not found or access denied: ${errFetch?.message || 'Record not found'}`);
  }

  // 2. Reject downgrade of already fulfilled promise (fulfilled is a terminal financial state)
  if (existingPromise.status === 'fulfilled' && status !== 'fulfilled') {
    throw new Error('Cannot change status on an already fulfilled payment promise. Fulfilled is a terminal state.');
  }

  // 3. If transitioning to 'fulfilled', verify actual payment satisfaction
  if (status === 'fulfilled') {
    if (!existingPromise.invoice_id) {
      throw new Error(
        'Cannot mark unlinked promise as fulfilled: Under the current schema, a payment promise must be linked to a specific invoice with verified payment records to confirm fulfilment.'
      );
    }

    // Query invoice
    const { data: invoice, error: errInv } = await supabase
      .from('invoices')
      .select('id, total_amount, amount_paid, balance_due, status, deleted_at')
      .eq('business_id', businessId)
      .eq('id', existingPromise.invoice_id)
      .maybeSingle();

    if (errInv || !invoice) {
      throw new Error('Invoice associated with this promise not found or access denied.');
    }

    // Query all payments recorded for this invoice
    const { data: payments, error: errPay } = await supabase
      .from('payments')
      .select('id, amount, payment_date, created_at')
      .eq('business_id', businessId)
      .eq('invoice_id', existingPromise.invoice_id)
      .order('created_at', { ascending: true });

    if (errPay) {
      throw new Error(`Failed to verify payment records: ${errPay.message}`);
    }

    if (!payments || payments.length === 0) {
      throw new Error(
        'Cannot mark promise as fulfilled: No recorded payment exists for this invoice. Payments must be recorded through record_invoice_payment().'
      );
    }

    // Eligible payments: recorded on or after promise creation (strict timestamp parity, no backward grace window)
    const promCreatedAtMs = new Date(existingPromise.created_at).getTime();
    const paymentsSincePromise = payments.filter(
      (p) => new Date(p.created_at).getTime() >= promCreatedAtMs
    );

    if (paymentsSincePromise.length === 0) {
      throw new Error(
        'Cannot mark promise as fulfilled: No new payments have been recorded for this invoice since the promise was created.'
      );
    }

    const paidSincePromisePaise = paymentsSincePromise.reduce(
      (sum, p) => sum + Math.round(Number(p.amount) * 100),
      0
    );
    const promisedPaise = Math.round(Number(existingPromise.promised_amount) * 100);
    const balanceDuePaise = Math.round(Number(invoice.balance_due ?? 0) * 100);

    // Fulfilment condition:
    // Either payments recorded since promise >= promised amount,
    // OR invoice is paid in full (balance_due <= 0).
    const isSatisfied = paidSincePromisePaise >= promisedPaise || balanceDuePaise <= 0;

    if (!isSatisfied) {
      const paidINR = (paidSincePromisePaise / 100).toFixed(2);
      const promisedINR = (promisedPaise / 100).toFixed(2);
      const balanceINR = (balanceDuePaise / 100).toFixed(2);
      throw new Error(
        `Cannot mark promise as fulfilled: Recorded payment amount (₹${paidINR}) is less than promised amount (₹${promisedINR}) and remaining invoice balance is ₹${balanceINR}.`
      );
    }
  }

  // 3. Update status in PostgreSQL
  const { data, error } = await supabase
    .from('payment_promises')
    .update({ status })
    .eq('business_id', businessId)
    .eq('id', promiseId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update promise status: ${error?.message || 'Record not found'}`);
  }

  const row = data as PaymentPromiseRawRow;
  const amount = Number(row.promised_amount ?? 0);
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id || undefined,
    rawMessage: row.raw_message,
    promisedAmount: amount,
    promisedAmountPaise: Math.round(amount * 100),
    promisedDate: row.promised_date,
    status: row.status,
    confidenceScore: Number(row.confidence_score ?? 0.85),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Updates payment promise fields with strict immutability:
 * An already fulfilled promise cannot have its invoice, customer, or promised amount modified.
 */
export async function updatePaymentPromise(
  supabase: DbClient,
  businessId: string,
  input: UpdatePaymentPromiseDetailsInput
): Promise<PaymentPromiseRecord> {
  const validated = UpdatePaymentPromiseDetailsSchema.parse(input);

  const { data: existing, error: errFetch } = await supabase
    .from('payment_promises')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', validated.promiseId)
    .maybeSingle();

  if (errFetch || !existing) {
    throw new Error(`Payment promise not found or access denied: ${errFetch?.message || 'Record not found'}`);
  }

  // Immutability invariant: already fulfilled promises cannot have status, invoice, or amount changed
  if (existing.status === 'fulfilled') {
    if (validated.status !== undefined && validated.status !== 'fulfilled') {
      throw new Error('Cannot change status on an already fulfilled payment promise. Fulfilled is a terminal state.');
    }
    if (validated.invoiceId !== undefined && validated.invoiceId !== existing.invoice_id) {
      throw new Error('Cannot change invoice on an already fulfilled payment promise.');
    }
    if (
      validated.promisedAmount !== undefined &&
      Math.round(validated.promisedAmount * 100) !== Math.round(Number(existing.promised_amount) * 100)
    ) {
      throw new Error('Cannot change promised amount on an already fulfilled payment promise.');
    }
  }

  // If status is transitioning, route through status validator
  if (validated.status && validated.status !== existing.status) {
    return updatePaymentPromiseStatus(supabase, businessId, validated.promiseId, validated.status);
  }

  const updates: Record<string, unknown> = {};
  if (validated.invoiceId !== undefined) updates.invoice_id = validated.invoiceId;
  if (validated.promisedAmount !== undefined) updates.promised_amount = validated.promisedAmount;

  if (Object.keys(updates).length === 0) {
    const amount = Number(existing.promised_amount ?? 0);
    return {
      id: existing.id,
      businessId: existing.business_id,
      customerId: existing.customer_id,
      invoiceId: existing.invoice_id || undefined,
      rawMessage: existing.raw_message,
      promisedAmount: amount,
      promisedAmountPaise: Math.round(amount * 100),
      promisedDate: existing.promised_date,
      status: existing.status,
      confidenceScore: Number(existing.confidence_score ?? 0.85),
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }

  const { data, error } = await supabase
    .from('payment_promises')
    .update(updates)
    .eq('business_id', businessId)
    .eq('id', validated.promiseId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update promise: ${error?.message || 'Update failed'}`);
  }

  const row = data as PaymentPromiseRawRow;
  const amount = Number(row.promised_amount ?? 0);
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id || undefined,
    rawMessage: row.raw_message,
    promisedAmount: amount,
    promisedAmountPaise: Math.round(amount * 100),
    promisedDate: row.promised_date,
    status: row.status,
    confidenceScore: Number(row.confidence_score ?? 0.85),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetches follow-up tasks for the business.
 */
export async function getFollowUpTasks(
  supabase: DbClient,
  businessId: string
): Promise<FollowUpTaskRecord[]> {
  const { data, error } = await supabase
    .from('follow_up_tasks')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to retrieve follow-up tasks: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  return (data as FollowUpTaskRawRow[]).map((row) => {
    const { outcome, notes } = decodeFollowUpNotes(row.last_reminder_text);
    return {
      id: row.id,
      businessId: row.business_id,
      customerId: row.customer_id,
      invoiceId: row.invoice_id || undefined,
      priorityScore: Number(row.priority_score ?? 0),
      priorityLevel: row.priority_level,
      dueDate: row.due_date,
      status: row.status,
      tone: dbToneToUiTone(row.last_reminder_tone),
      outcome,
      notes,
      lastContactedAt: row.last_contacted_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Creates a follow-up task logging parent contact history.
 */
export async function createFollowUpTask(
  supabase: DbClient,
  businessId: string,
  input: CreateFollowUpTaskInput
): Promise<FollowUpTaskRecord> {
  const validated = CreateFollowUpTaskSchema.parse(input);

  // 1. Verify customer belongs to this business
  const { data: customer, error: errCust } = await supabase
    .from('customers')
    .select('id')
    .eq('business_id', businessId)
    .eq('id', validated.customerId)
    .maybeSingle();

  if (errCust || !customer) {
    throw new Error('Customer does not belong to your business.');
  }

  // 2. If invoiceId provided, verify invoice belongs to customer & business
  if (validated.invoiceId) {
    const { data: inv, error: errInv } = await supabase
      .from('invoices')
      .select('id')
      .eq('business_id', businessId)
      .eq('customer_id', validated.customerId)
      .eq('id', validated.invoiceId)
      .maybeSingle();

    if (errInv || !inv) {
      throw new Error('Invoice does not exist or does not belong to this student.');
    }
  }

  const encodedText = encodeFollowUpNotes(validated.outcome, validated.notes);
  const dbTone = uiToneToDbTone(validated.tone);
  const contactedAt = validated.contactedAt || new Date().toISOString();
  const dueDate = validated.dueDate || new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('follow_up_tasks')
    .insert({
      business_id: businessId,
      customer_id: validated.customerId,
      invoice_id: validated.invoiceId || null,
      priority_score: validated.priorityScore,
      priority_level: validated.priorityLevel,
      due_date: dueDate,
      status: validated.status,
      last_reminder_tone: dbTone,
      last_reminder_text: encodedText,
      last_contacted_at: contactedAt,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create follow-up task: ${error?.message || 'Database error'}`);
  }

  const row = data as FollowUpTaskRawRow;
  const { outcome, notes } = decodeFollowUpNotes(row.last_reminder_text);
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id || undefined,
    priorityScore: Number(row.priority_score ?? 0),
    priorityLevel: row.priority_level,
    dueDate: row.due_date,
    status: row.status,
    tone: dbToneToUiTone(row.last_reminder_tone),
    outcome,
    notes,
    lastContactedAt: row.last_contacted_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Updates a follow-up task status (pending | completed | dismissed).
 */
export async function updateFollowUpTaskStatus(
  supabase: DbClient,
  businessId: string,
  taskId: string,
  status: 'pending' | 'completed' | 'dismissed'
): Promise<FollowUpTaskRecord> {
  const { data, error } = await supabase
    .from('follow_up_tasks')
    .update({ status })
    .eq('business_id', businessId)
    .eq('id', taskId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update task status: ${error?.message || 'Record not found'}`);
  }

  const row = data as FollowUpTaskRawRow;
  const { outcome, notes } = decodeFollowUpNotes(row.last_reminder_text);
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    invoiceId: row.invoice_id || undefined,
    priorityScore: Number(row.priority_score ?? 0),
    priorityLevel: row.priority_level,
    dueDate: row.due_date,
    status: row.status,
    tone: dbToneToUiTone(row.last_reminder_tone),
    outcome,
    notes,
    lastContactedAt: row.last_contacted_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Loads and aggregates all real PostgreSQL data required for the Smart Recovery Queue.
 */
export async function getRecoveryQueueData(
  supabase: DbClient,
  businessId: string,
  asOfDate?: string
): Promise<RecoveryQueueData> {
  const evaluationDate = asOfDate || new Date().toISOString().slice(0, 10);

  // Fetch all dependencies in parallel
  const [
    customers,
    invoices,
    payments,
    promises,
    followUpTasks,
    bizSettingsRes,
    bizRes,
  ] = await Promise.all([
    getCustomers(supabase, businessId, { includeArchived: false }),
    getInvoices(supabase, businessId),
    getPayments(supabase, businessId),
    getPaymentPromises(supabase, businessId),
    getFollowUpTasks(supabase, businessId),
    supabase
      .from('business_settings')
      .select('upi_id, invoice_prefix')
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('name, owner_id')
      .eq('id', businessId)
      .single(),
  ]);

  // Fetch owner profile name
  let ownerName = 'Tutor';
  if (bizRes.data?.owner_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', bizRes.data.owner_id)
      .maybeSingle();
    if (profile?.full_name) {
      ownerName = profile.full_name;
    }
  }

  const businessName = bizRes.data?.name || 'Tutoring Academy';
  const upiId = bizSettingsRes.data?.upi_id || 'fees@upi';

  // 1. Convert Invoices to SampleInvoice format
  const sampleInvoices: SampleInvoice[] = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerName: inv.customerName,
    customerGrade: inv.customerGrade,
    parentName: inv.parentName || '—',
    parentPhone: inv.parentPhone || inv.customerId || '—',
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotal: inv.subtotal,
    discount: inv.discount,
    totalAmount: inv.totalAmount,
    amountPaid: inv.amountPaid,
    balanceDue: inv.balanceDue,
    status: (inv.effectiveStatus || inv.status) as SampleInvoiceStatus,
    paymentTerms: 'Due on receipt',
    notes: inv.notes,
    items: (inv.items || []).map((it) => ({
      id: it.id,
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    })),
  }));

  // 2. Convert Customers to SampleCustomer format
  const sampleCustomers: SampleCustomer[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    parentName: c.parentName || '—',
    gradeSubject: c.gradeSubject || 'General',
    email: c.email || undefined,
    phone: c.phone,
    whatsappNumber: c.whatsappNumber,
    defaultFeeAmount: c.defaultFeeAmount,
    billingCycleDay: c.billingCycleDay,
    status: c.status,
    notes: c.notes,
    totalInvoiced: c.totalInvoiced,
    totalCollected: c.totalCollected,
    outstandingBalance: c.outstandingBalance,
    nextPaymentDate: c.nextPaymentDate || evaluationDate,
    overdueCount: c.overdueCount,
    joinedDate: c.joinedDate,
  }));

  // 3. Convert Promises to SamplePaymentPromise format
  const samplePromises: SamplePaymentPromise[] = promises.map((p) => ({
    id: p.id,
    customerId: p.customerId,
    invoiceId: p.invoiceId,
    rawMessage: p.rawMessage,
    promisedAmount: p.promisedAmount,
    promisedDate: p.promisedDate,
    status: p.status,
    confidenceScore: p.confidenceScore,
  }));

  // 4. Convert Follow-up Tasks to RecoveryFollowUp format
  const recoveryFollowUps: RecoveryFollowUp[] = followUpTasks.map((task) => {
    const matchingCust = customers.find((c) => c.id === task.customerId);
    const matchingInv = invoices.find((i) => i.id === task.invoiceId);
    return {
      id: task.id,
      customerId: task.customerId,
      customerName: matchingCust?.name || 'Student',
      parentName: matchingCust?.parentName || 'Parent',
      invoiceId: task.invoiceId,
      invoiceNumber: matchingInv?.invoiceNumber,
      followUpDate: task.lastContactedAt ? task.lastContactedAt.slice(0, 10) : task.createdAt.slice(0, 10),
      outcome: task.outcome,
      notes: task.notes,
      nextFollowUpDate: task.dueDate,
      tone: task.tone,
      recordedAt: task.createdAt,
    };
  });

  // 5. Execute deterministic recovery queue calculation
  const recoveryQueue = buildRecoveryQueue(
    sampleCustomers,
    sampleInvoices,
    samplePromises,
    recoveryFollowUps,
    evaluationDate
  );

  // 6. Execute deterministic stats calculation
  const stats = computeRecoveryStats(
    recoveryQueue,
    sampleInvoices,
    samplePromises,
    recoveryFollowUps,
    payments.map((p) => ({ amount: p.amount, paymentDate: p.paymentDate })),
    evaluationDate
  );

  return {
    items: recoveryQueue,
    stats,
    customers,
    invoices,
    promises,
    followUps: recoveryFollowUps,
    payments,
    businessProfile: {
      businessName,
      ownerName,
      upiId,
    },
    asOfDate: evaluationDate,
  };
}
