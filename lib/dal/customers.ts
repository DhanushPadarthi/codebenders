import { z } from 'zod';
import type { createClient as createServerClient } from '@/lib/supabase/server';
import type { CustomerStatus, Database } from '@/types/database.types';

type DbClient = Awaited<ReturnType<typeof createServerClient>>;

// ============================================================================
// Types & Schemas
// ============================================================================

export type CustomerRow = Database['public']['Tables']['customers']['Row'];
export type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
export type CustomerUpdate = Database['public']['Tables']['customers']['Update'];

export interface CustomerRecord {
  id: string;
  businessId: string;
  name: string;
  parentName: string;
  gradeSubject: string;
  email?: string;
  phone: string;
  whatsappNumber: string;
  defaultFeeAmount: number;
  billingCycleDay: number;
  status: CustomerStatus;
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Computed & Aggregated Fields
  totalInvoiced: number;
  totalCollected: number;
  outstandingBalance: number;
  overdueCount: number;
  nextPaymentDate: string;
  joinedDate: string;
}

export const CreateCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Student name must be at least 2 characters')
    .max(100, 'Student name cannot exceed 100 characters'),
  parentName: z
    .string()
    .trim()
    .min(2, 'Parent/Guardian name must be at least 2 characters')
    .max(100, 'Parent name cannot exceed 100 characters'),
  gradeSubject: z
    .string()
    .trim()
    .min(1, 'Batch / Grade is required')
    .max(100, 'Batch name cannot exceed 100 characters'),
  phone: z
    .string()
    .trim()
    .min(10, 'Mobile number must be at least 10 digits')
    .max(20, 'Mobile number is too long'),
  whatsappNumber: z
    .string()
    .trim()
    .min(10, 'WhatsApp number must be at least 10 digits')
    .max(20, 'WhatsApp number is too long'),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address')
    .optional()
    .or(z.literal('')),
  defaultFeeAmount: z
    .number({ invalid_type_error: 'Monthly fee must be a number' })
    .min(0, 'Monthly fee cannot be negative'),
  billingCycleDay: z
    .number({ invalid_type_error: 'Billing cycle day must be a number' })
    .int('Billing cycle day must be an integer')
    .min(1, 'Billing cycle day must be between 1 and 31')
    .max(31, 'Billing cycle day must be between 1 and 31'),
  notes: z
    .string()
    .trim()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .or(z.literal('')),
});

export const UpdateCustomerSchema = CreateCustomerSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'archived'] as const).optional(),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Clean and format Indian and international phone numbers into display format.
 */
export function formatPhoneNumber(p: string): string {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return p.trim();
}

/**
 * Calculates the next upcoming payment date (YYYY-MM-DD) based on the billing cycle day.
 * Safely clamps days for shorter months (e.g., Feb 28, Apr 30).
 */
export function calculateNextPaymentDate(
  billingCycleDay: number,
  fromDate: Date = new Date()
): string {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();
  const currentDay = fromDate.getDate();

  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const clampedDayCurrent = Math.min(Math.max(1, billingCycleDay), daysInCurrentMonth);

  if (currentDay <= clampedDayCurrent) {
    const d = new Date(year, month, clampedDayCurrent);
    return d.toISOString().slice(0, 10);
  } else {
    const nextMonthYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const daysInNextMonth = new Date(nextMonthYear, nextMonth + 1, 0).getDate();
    const clampedDayNext = Math.min(Math.max(1, billingCycleDay), daysInNextMonth);
    const d = new Date(nextMonthYear, nextMonth, clampedDayNext);
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Maps a database customer row and optional invoice financial stats to CustomerRecord.
 * Prevents floating-point rounding errors with integer paise conversion.
 */
export function mapCustomerRow(
  row: CustomerRow,
  financials?: {
    totalInvoicedPaise: number;
    totalCollectedPaise: number;
    outstandingBalancePaise: number;
    overdueCount: number;
  }
): CustomerRecord {
  const totalInvoiced = financials ? financials.totalInvoicedPaise / 100 : 0;
  const totalCollected = financials ? financials.totalCollectedPaise / 100 : 0;
  const outstandingBalance = financials ? financials.outstandingBalancePaise / 100 : 0;
  const overdueCount = financials ? financials.overdueCount : 0;

  const cycleDay = row.billing_cycle_day ?? 1;
  const joinedDate = row.created_at
    ? new Date(row.created_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    parentName: row.parent_name || '',
    gradeSubject: row.grade_subject || 'General Batch',
    email: row.email || undefined,
    phone: formatPhoneNumber(row.phone),
    whatsappNumber: formatPhoneNumber(row.whatsapp_number),
    defaultFeeAmount: Number(row.default_fee_amount ?? 0),
    billingCycleDay: cycleDay,
    status: row.status,
    notes: row.notes || undefined,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalInvoiced,
    totalCollected,
    outstandingBalance,
    overdueCount,
    nextPaymentDate: calculateNextPaymentDate(cycleDay),
    joinedDate,
  };
}

// ============================================================================
// Data Access Methods (Scoped strictly to business_id and Supabase client)
// ============================================================================

/**
 * Fetches all non-deleted customers for a business, along with aggregated invoice metrics.
 */
export async function getCustomers(
  supabase: DbClient,
  businessId: string,
  options?: {
    search?: string;
    status?: string;
    batch?: string;
    includeArchived?: boolean;
  }
): Promise<CustomerRecord[]> {
  let query = supabase
    .from('customers')
    .select('*')
    .eq('business_id', businessId);

  if (!options?.includeArchived) {
    query = query.is('deleted_at', null);
  }

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  if (options?.batch && options.batch !== 'all') {
    query = query.eq('grade_subject', options.batch);
  }

  if (options?.search?.trim()) {
    const s = options.search.trim();
    // ilike search on name or phone
    query = query.or(`name.ilike.%${s}%,parent_name.ilike.%${s}%,phone.ilike.%${s}%,whatsapp_number.ilike.%${s}%`);
  }

  query = query.order('created_at', { ascending: false });

  const { data: customerRows, error: custError } = await query;
  if (custError) {
    throw new Error(`Failed to load customers: ${custError.message}`);
  }

  if (!customerRows || customerRows.length === 0) {
    return [];
  }

  // Fetch active invoices for this business to aggregate real financial balances
  const { data: invoiceRows, error: invError } = await supabase
    .from('invoices')
    .select('id, customer_id, total_amount, amount_paid, balance_due, status, due_date')
    .eq('business_id', businessId)
    .is('deleted_at', null);

  // Group invoices by customer_id using integer paise arithmetic
  const financialMap = new Map<
    string,
    {
      totalInvoicedPaise: number;
      totalCollectedPaise: number;
      outstandingBalancePaise: number;
      overdueCount: number;
    }
  >();

  if (!invError && invoiceRows) {
    const today = new Date().toISOString().slice(0, 10);
    for (const inv of invoiceRows) {
      const custId = inv.customer_id;
      if (!financialMap.has(custId)) {
        financialMap.set(custId, {
          totalInvoicedPaise: 0,
          totalCollectedPaise: 0,
          outstandingBalancePaise: 0,
          overdueCount: 0,
        });
      }
      const entry = financialMap.get(custId)!;
      entry.totalInvoicedPaise += Math.round(Number(inv.total_amount || 0) * 100);
      entry.totalCollectedPaise += Math.round(Number(inv.amount_paid || 0) * 100);
      const balancePaise = Math.round(Number(inv.balance_due || 0) * 100);
      entry.outstandingBalancePaise += balancePaise;

      const isOverdue =
        inv.status === 'overdue' || (inv.due_date < today && balancePaise > 0);
      if (isOverdue) {
        entry.overdueCount++;
      }
    }
  }

  return customerRows.map((row: CustomerRow) =>
    mapCustomerRow(row, financialMap.get(row.id))
  );
}

/**
 * Fetches a single customer by ID.
 */
export async function getCustomerById(
  supabase: DbClient,
  businessId: string,
  customerId: string
): Promise<CustomerRecord | null> {
  const { data: row, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !row) {
    return null;
  }

  // Fetch invoices for this single customer
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, customer_id, total_amount, amount_paid, balance_due, status, due_date')
    .eq('customer_id', customerId)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  let totalInvoicedPaise = 0;
  let totalCollectedPaise = 0;
  let outstandingBalancePaise = 0;
  let overdueCount = 0;

  if (invoiceRows) {
    const today = new Date().toISOString().slice(0, 10);
    for (const inv of invoiceRows) {
      totalInvoicedPaise += Math.round(Number(inv.total_amount || 0) * 100);
      totalCollectedPaise += Math.round(Number(inv.amount_paid || 0) * 100);
      const balancePaise = Math.round(Number(inv.balance_due || 0) * 100);
      outstandingBalancePaise += balancePaise;
      if (inv.status === 'overdue' || (inv.due_date < today && balancePaise > 0)) {
        overdueCount++;
      }
    }
  }

  return mapCustomerRow(row, {
    totalInvoicedPaise,
    totalCollectedPaise,
    outstandingBalancePaise,
    overdueCount,
  });
}

/**
 * Inserts a new customer record into public.customers.
 */
export async function createCustomer(
  supabase: DbClient,
  businessId: string,
  input: CreateCustomerInput
): Promise<CustomerRecord> {
  const validated = CreateCustomerSchema.parse(input);

  const insertPayload: CustomerInsert = {
    business_id: businessId,
    name: validated.name,
    parent_name: validated.parentName || null,
    grade_subject: validated.gradeSubject || null,
    phone: validated.phone,
    whatsapp_number: validated.whatsappNumber,
    email: validated.email || null,
    default_fee_amount: validated.defaultFeeAmount,
    billing_cycle_day: validated.billingCycleDay,
    status: 'active',
    notes: validated.notes || null,
  };

  const { data: createdRow, error } = await supabase
    .from('customers')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !createdRow) {
    throw new Error(`Failed to create customer: ${error?.message || 'Unknown database error'}`);
  }

  return mapCustomerRow(createdRow);
}

/**
 * Updates an existing customer record.
 */
export async function updateCustomer(
  supabase: DbClient,
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput
): Promise<CustomerRecord> {
  const validated = UpdateCustomerSchema.parse(input);

  const updatePayload: CustomerUpdate = {};
  if (validated.name !== undefined) updatePayload.name = validated.name;
  if (validated.parentName !== undefined) updatePayload.parent_name = validated.parentName || null;
  if (validated.gradeSubject !== undefined) updatePayload.grade_subject = validated.gradeSubject || null;
  if (validated.phone !== undefined) updatePayload.phone = validated.phone;
  if (validated.whatsappNumber !== undefined) updatePayload.whatsapp_number = validated.whatsappNumber;
  if (validated.email !== undefined) updatePayload.email = validated.email || null;
  if (validated.defaultFeeAmount !== undefined) updatePayload.default_fee_amount = validated.defaultFeeAmount;
  if (validated.billingCycleDay !== undefined) updatePayload.billing_cycle_day = validated.billingCycleDay;
  if (validated.status !== undefined) updatePayload.status = validated.status;
  if (validated.notes !== undefined) updatePayload.notes = validated.notes || null;

  const { data: updatedRow, error } = await supabase
    .from('customers')
    .update(updatePayload)
    .eq('id', customerId)
    .eq('business_id', businessId)
    .select('*')
    .single();

  if (error || !updatedRow) {
    throw new Error(`Failed to update customer: ${error?.message || 'Customer not found or update denied'}`);
  }

  return mapCustomerRow(updatedRow);
}

/**
 * Soft-deletes an existing customer by setting deleted_at = NOW() and status = 'archived'.
 * Physical deletion is permanently revoked on the database table to protect financial auditability.
 */
export async function archiveCustomer(
  supabase: DbClient,
  businessId: string,
  customerId: string
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('customers')
    .update({
      deleted_at: new Date().toISOString(),
      status: 'archived',
    })
    .eq('id', customerId)
    .eq('business_id', businessId);

  if (error) {
    throw new Error(`Failed to archive customer: ${error.message}`);
  }

  return { success: true };
}
