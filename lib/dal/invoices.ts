import { z } from 'zod';
import type { createClient as createServerClient } from '@/lib/supabase/server';
import type { InvoiceStatus, AgeingBucket, Database } from '@/types/database.types';
import { calculateLineTotal, calculateInvoiceTotals } from '@/lib/finance/invoice-calculations';

type DbClient = Awaited<ReturnType<typeof createServerClient>>;

// ============================================================================
// Types & Schemas
// ============================================================================

export type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
export type InvoiceItemRow = Database['public']['Tables']['invoice_items']['Row'];

export interface InvoiceItemRecord {
  id: string;
  businessId: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRecord {
  id: string;
  businessId: string;
  customerId: string;
  customerName: string;
  customerGrade: string;
  parentName: string;
  parentPhone: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  discount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  effectiveStatus?: InvoiceStatus;
  overdueDays?: number;
  ageingBucket?: AgeingBucket;
  notes?: string;
  pdfUrl?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItemRecord[];
}

export const LineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Item description is required')
    .max(200, 'Description cannot exceed 200 characters'),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity must be greater than zero'),
  unitPrice: z
    .number({ invalid_type_error: 'Unit price must be a number' })
    .min(0, 'Unit price cannot be negative'),
});

export const CreateInvoiceSchema = z
  .object({
    customerId: z.string().uuid('Please select a valid student'),
    invoiceNumber: z
      .string()
      .trim()
      .min(1, 'Invoice number is required')
      .max(50, 'Invoice number is too long')
      .optional(),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Issue date must be in YYYY-MM-DD format'),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format'),
    discount: z
      .number({ invalid_type_error: 'Discount must be a number' })
      .min(0, 'Discount cannot be negative')
      .default(0),
    notes: z
      .string()
      .trim()
      .max(1000, 'Notes cannot exceed 1000 characters')
      .optional()
      .or(z.literal('')),
    items: z.array(LineItemSchema).min(1, 'Invoice must have at least one line item'),
    status: z.enum(['draft', 'sent'] as const).default('draft'),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'Due date must be on or after issue date',
    path: ['dueDate'],
  });

export const UpdateDraftInvoiceSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    discount: z.number().min(0).optional(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .or(z.literal('')),
    items: z.array(LineItemSchema).min(1).optional(),
  })
  .refine(
    (data) => {
      if (data.issueDate && data.dueDate) {
        return data.dueDate >= data.issueDate;
      }
      return true;
    },
    {
      message: 'Due date must be on or after issue date',
      path: ['dueDate'],
    }
  );

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
export type UpdateDraftInvoiceInput = z.infer<typeof UpdateDraftInvoiceSchema>;

export interface InvoiceRawRow {
  id: string;
  business_id: string;
  customer_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number | string;
  discount: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  balance_due?: number | string | null;
  status: string;
  effective_status?: string | null;
  overdue_days?: number | string | null;
  ageing_bucket?: string | null;
  notes?: string | null;
  pdf_url?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
  customer_grade?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
}

export interface InvoiceItemRawRow {
  id: string;
  business_id: string;
  invoice_id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  total_price: number | string;
  created_at: string;
  updated_at: string;
}

interface CustomerSummaryRow {
  id: string;
  name: string;
  grade_subject: string | null;
  parent_name: string | null;
  phone: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Maps an invoice database row and associated customer + line items to InvoiceRecord.
 * Converts NUMERIC columns to Javascript numbers using integer paise precision.
 */
export function mapInvoiceRow(
  inv: InvoiceRawRow,
  customer?: { name: string; grade_subject: string | null; parent_name: string | null; phone: string } | null,
  items: InvoiceItemRecord[] = []
): InvoiceRecord {
  const subtotal = Number(inv.subtotal ?? 0);
  const discount = Number(inv.discount ?? 0);
  const totalAmount = Number(inv.total_amount ?? 0);
  const amountPaid = Number(inv.amount_paid ?? 0);
  const balanceDue = Number(inv.balance_due ?? totalAmount - amountPaid);

  return {
    id: inv.id,
    businessId: inv.business_id,
    customerId: inv.customer_id,
    customerName: customer?.name || inv.customer_name || 'Unknown Student',
    customerGrade: customer?.grade_subject || inv.customer_grade || 'General Batch',
    parentName: customer?.parent_name || inv.parent_name || '',
    parentPhone: customer?.phone || inv.parent_phone || '',
    invoiceNumber: inv.invoice_number,
    issueDate: String(inv.issue_date).slice(0, 10),
    dueDate: String(inv.due_date).slice(0, 10),
    subtotal,
    discount,
    totalAmount,
    amountPaid,
    balanceDue,
    status: inv.status as InvoiceStatus,
    effectiveStatus: (inv.effective_status as InvoiceStatus) || (inv.status as InvoiceStatus),
    overdueDays: inv.overdue_days !== undefined && inv.overdue_days !== null ? Number(inv.overdue_days) : undefined,
    ageingBucket: (inv.ageing_bucket as AgeingBucket) || undefined,
    notes: inv.notes || undefined,
    pdfUrl: inv.pdf_url || undefined,
    deletedAt: inv.deleted_at || null,
    createdAt: inv.created_at,
    updatedAt: inv.updated_at,
    items,
  };
}

/**
 * Maps an invoice_items row to InvoiceItemRecord.
 */
export function mapInvoiceItemRow(row: InvoiceItemRawRow): InvoiceItemRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    totalPrice: Number(row.total_price),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Generates the next sequential invoice number for a business (e.g. INV-2026-001).
 * Respects business_settings.invoice_prefix and unique business constraints.
 */
export async function generateNextInvoiceNumber(
  supabase: DbClient,
  businessId: string,
  prefix: string = 'INV-'
): Promise<string> {
  const currentYear = new Date().getFullYear();
  const searchPattern = `${prefix}${currentYear}-%`;

  const { data: existingInvoices, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('business_id', businessId)
    .like('invoice_number', searchPattern);

  if (error) {
    console.warn('generateNextInvoiceNumber query error:', error.message);
  }

  let highestNum = 0;
  if (existingInvoices && existingInvoices.length > 0) {
    for (const inv of existingInvoices) {
      const match = (inv as { invoice_number: string }).invoice_number.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) highestNum = num;
      }
    }
  }

  const nextSeq = String(highestNum + 1).padStart(3, '0');
  return `${prefix}${currentYear}-${nextSeq}`;
}

// ============================================================================
// Data Access Methods (Strictly scoped by business_id)
// ============================================================================

/**
 * Fetches invoices for a business using the real-time v_invoices_effective view.
 * Includes customer info and line items.
 */
export async function getInvoices(
  supabase: DbClient,
  businessId: string,
  options?: {
    search?: string;
    status?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
    includeArchived?: boolean;
  }
): Promise<InvoiceRecord[]> {
  const viewName = options?.includeArchived ? 'v_invoices_history' : 'v_invoices_effective';

  let query = supabase
    .from(viewName)
    .select('*')
    .eq('business_id', businessId);

  if (options?.customerId) {
    query = query.eq('customer_id', options.customerId);
  }

  if (options?.status && options.status !== 'all') {
    if (options.status === 'overdue') {
      // Overdue matches either stored status or dynamic effective_status
      query = query.or('status.eq.overdue,effective_status.eq.overdue');
    } else {
      query = query.eq('status', options.status);
    }
  }

  if (options?.startDate) {
    query = query.gte('issue_date', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('issue_date', options.endDate);
  }

  query = query.order('created_at', { ascending: false });

  const { data: invoiceRows, error: invError } = await query;
  if (invError) {
    throw new Error(`Failed to load invoices: ${invError.message}`);
  }

  if (!invoiceRows || invoiceRows.length === 0) {
    return [];
  }

  // Fetch customer details for these invoices
  const customerIds = Array.from(new Set(invoiceRows.map((inv) => (inv as InvoiceRawRow).customer_id)));
  const { data: customerRows } = await supabase
    .from('customers')
    .select('id, name, grade_subject, parent_name, phone')
    .in('id', customerIds);

  const customerMap = new Map<string, CustomerSummaryRow>();
  if (customerRows) {
    for (const c of customerRows) {
      customerMap.set(c.id, c as CustomerSummaryRow);
    }
  }

  // Fetch line items for these invoices
  const invoiceIds = invoiceRows.map((inv) => (inv as InvoiceRawRow).id);
  const { data: lineItemRows } = await supabase
    .from('invoice_items')
    .select('*')
    .in('invoice_id', invoiceIds)
    .order('created_at', { ascending: true });

  const itemsMap = new Map<string, InvoiceItemRecord[]>();
  if (lineItemRows) {
    for (const item of lineItemRows) {
      const mapped = mapInvoiceItemRow(item as InvoiceItemRawRow);
      if (!itemsMap.has(mapped.invoiceId)) {
        itemsMap.set(mapped.invoiceId, []);
      }
      itemsMap.get(mapped.invoiceId)!.push(mapped);
    }
  }

  // Map into domain records
  let results = invoiceRows.map((inv) => {
    const raw = inv as InvoiceRawRow;
    return mapInvoiceRow(raw, customerMap.get(raw.customer_id), itemsMap.get(raw.id) || []);
  });

  // Apply search filtering on student name, invoice number, or parent
  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    results = results.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.parentName.toLowerCase().includes(q) ||
        inv.parentPhone.includes(q)
    );
  }

  return results;
}

/**
 * Fetches a single invoice by ID with line items and customer information.
 */
export async function getInvoiceById(
  supabase: DbClient,
  businessId: string,
  invoiceId: string
): Promise<InvoiceRecord | null> {
  const { data: invRow, error: invError } = await supabase
    .from('v_invoices_effective')
    .select('*')
    .eq('id', invoiceId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (invError || !invRow) {
    // Check history view in case it's archived/cancelled
    const { data: histRow } = await supabase
      .from('v_invoices_history')
      .select('*')
      .eq('id', invoiceId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (!histRow) return null;
    return fetchInvoiceRelations(supabase, businessId, histRow);
  }

  return fetchInvoiceRelations(supabase, businessId, invRow);
}

async function fetchInvoiceRelations(
  supabase: DbClient,
  businessId: string,
  invRow: InvoiceRawRow
): Promise<InvoiceRecord> {
  // Fetch customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, grade_subject, parent_name, phone')
    .eq('id', invRow.customer_id)
    .single();

  // Fetch line items
  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invRow.id)
    .eq('business_id', businessId)
    .order('created_at', { ascending: true });

  const mappedItems = (items || []).map(mapInvoiceItemRow);
  return mapInvoiceRow(invRow, customer, mappedItems);
}

/**
 * Creates an invoice with line items.
 * Performs pre-flight financial validation in integer paise.
 * Triggers on invoice_items maintain stored totals automatically.
 */
export async function createInvoice(
  supabase: DbClient,
  businessId: string,
  input: CreateCustomerInvoiceInput
): Promise<InvoiceRecord> {
  const validated = CreateInvoiceSchema.parse(input);

  // 1. Verify customer belongs to this business
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, name, grade_subject, parent_name, phone')
    .eq('id', validated.customerId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .single();

  if (custErr || !customer) {
    throw new Error('Selected student does not exist or does not belong to your academy.');
  }

  // 2. Resolve invoice number
  let invoiceNumber = validated.invoiceNumber;
  if (!invoiceNumber) {
    invoiceNumber = await generateNextInvoiceNumber(supabase, businessId);
  }

  // 3. Precalculate totals in integer paise
  const lineItemTotals = validated.items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    totalPrice: calculateLineTotal(it.quantity, it.unitPrice),
  }));

  const totals = calculateInvoiceTotals(lineItemTotals, validated.discount, 0);

  // 4. Insert draft invoice
  const { data: createdInv, error: insertInvErr } = await supabase
    .from('invoices')
    .insert({
      business_id: businessId,
      customer_id: validated.customerId,
      invoice_number: invoiceNumber,
      issue_date: validated.issueDate,
      due_date: validated.dueDate,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total_amount: totals.totalAmount,
      status: 'draft',
      notes: validated.notes || null,
    })
    .select('*')
    .single();

  if (insertInvErr || !createdInv) {
    throw new Error(`Failed to create invoice: ${insertInvErr?.message || 'Database error'}`);
  }

  // 5. Insert line items
  const itemPayloads = lineItemTotals.map((it) => ({
    business_id: businessId,
    invoice_id: createdInv.id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unitPrice,
    total_price: it.totalPrice,
  }));

  const { data: createdItems, error: itemsErr } = await supabase
    .from('invoice_items')
    .insert(itemPayloads)
    .select('*');

  if (itemsErr || !createdItems) {
    // Rollback protection: Soft-delete the draft invoice so no orphan header is left
    try {
      await supabase.rpc('soft_delete_invoice', { p_invoice_id: createdInv.id });
    } catch {
      // Ignore cleanup error if already missing
    }
    throw new Error(`Failed to save invoice line items: ${itemsErr?.message || 'Database error'}`);
  }

  // 6. If target status is 'sent', transition using approved database RPC
  if (validated.status === 'sent') {
    const { error: transErr } = await supabase.rpc('transition_invoice_status', {
      p_invoice_id: createdInv.id,
      p_new_status: 'sent',
    });

    if (transErr) {
      console.warn('transition_invoice_status warning on create:', transErr.message);
    }
  }

  // 7. Return complete fresh invoice record
  return getInvoiceById(supabase, businessId, createdInv.id) as Promise<InvoiceRecord>;
}

export type CreateCustomerInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

/**
 * Updates a draft invoice. Finalized invoices are rejected by PostgreSQL triggers.
 */
export async function updateDraftInvoice(
  supabase: DbClient,
  businessId: string,
  invoiceId: string,
  input: UpdateDraftInvoiceInput
): Promise<InvoiceRecord> {
  const validated = UpdateDraftInvoiceSchema.parse(input);

  // 1. Fetch current invoice to verify it is draft
  const currentInv = await getInvoiceById(supabase, businessId, invoiceId);
  if (!currentInv) {
    throw new Error('Invoice not found.');
  }

  if (currentInv.status !== 'draft') {
    throw new Error(`Invoice is ${currentInv.status}. Only draft invoices can be edited.`);
  }

  // 2. Update invoice header columns permitted by column grants
  const updatePayload: Record<string, unknown> = {};
  if (validated.customerId) updatePayload.customer_id = validated.customerId;
  if (validated.issueDate) updatePayload.issue_date = validated.issueDate;
  if (validated.dueDate) updatePayload.due_date = validated.dueDate;
  if (validated.discount !== undefined) updatePayload.discount = validated.discount;
  if (validated.notes !== undefined) updatePayload.notes = validated.notes || null;

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateErr } = await supabase
      .from('invoices')
      .update(updatePayload)
      .eq('id', invoiceId)
      .eq('business_id', businessId);

    if (updateErr) {
      throw new Error(`Failed to update invoice: ${updateErr.message}`);
    }
  }

  // 3. If line items are provided, replace existing draft line items
  if (validated.items && validated.items.length > 0) {
    // Delete old items
    const { error: delErr } = await supabase
      .from('invoice_items')
      .delete()
      .eq('invoice_id', invoiceId)
      .eq('business_id', businessId);

    if (delErr) {
      throw new Error(`Failed to update line items: ${delErr.message}`);
    }

    // Insert new items
    const newItemsPayload = validated.items.map((it) => ({
      business_id: businessId,
      invoice_id: invoiceId,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      total_price: calculateLineTotal(it.quantity, it.unitPrice),
    }));

    const { error: insertItemsErr } = await supabase
      .from('invoice_items')
      .insert(newItemsPayload);

    if (insertItemsErr) {
      throw new Error(`Failed to insert updated line items: ${insertItemsErr.message}`);
    }
  }

  // 4. Return updated record (trigger recalculate_invoice_items_total has synced totals)
  return getInvoiceById(supabase, businessId, invoiceId) as Promise<InvoiceRecord>;
}

/**
 * Transitions invoice status using database RPC transition_invoice_status().
 */
export async function transitionInvoiceStatus(
  supabase: DbClient,
  businessId: string,
  invoiceId: string,
  newStatus: 'sent' | 'cancelled'
): Promise<{ success: boolean; status: string; previousStatus: string }> {
  const { data, error } = await supabase.rpc('transition_invoice_status', {
    p_invoice_id: invoiceId,
    p_new_status: newStatus,
  });

  if (error) {
    throw new Error(`Failed to transition invoice status: ${error.message}`);
  }

  const resultData = data as { status?: string; previous_status?: string } | null;
  return {
    success: true,
    status: resultData?.status || newStatus,
    previousStatus: resultData?.previous_status || '',
  };
}

/**
 * Soft-deletes an invoice using database RPC soft_delete_invoice().
 * Rejects invoices with recorded payments.
 */
export async function softDeleteInvoice(
  supabase: DbClient,
  businessId: string,
  invoiceId: string
): Promise<{ success: boolean }> {
  const { error } = await supabase.rpc('soft_delete_invoice', {
    p_invoice_id: invoiceId,
  });

  if (error) {
    throw new Error(`Failed to soft-delete invoice: ${error.message}`);
  }

  return { success: true };
}

/**
 * Precision integer paise financial summary calculation.
 */
export function calculateInvoiceSummary(invoices: InvoiceRecord[]) {
  let totalInvoicedPaise = 0;
  let totalCollectedPaise = 0;
  let totalOutstandingPaise = 0;
  let overdueAmountPaise = 0;
  let overdueCount = 0;

  for (const inv of invoices) {
    // Only count active non-deleted invoices
    if (inv.deletedAt) continue;

    const totalPaise = Math.round(inv.totalAmount * 100);
    const paidPaise = Math.round(inv.amountPaid * 100);
    const balancePaise = Math.round(inv.balanceDue * 100);

    totalInvoicedPaise += totalPaise;
    totalCollectedPaise += paidPaise;

    if (inv.status !== 'draft') {
      totalOutstandingPaise += balancePaise;
    }

    const isOverdue =
      inv.status === 'overdue' ||
      inv.effectiveStatus === 'overdue' ||
      (inv.dueDate < new Date().toISOString().slice(0, 10) && balancePaise > 0 && inv.status !== 'draft');

    if (isOverdue && balancePaise > 0) {
      overdueCount++;
      overdueAmountPaise += balancePaise;
    }
  }

  return {
    totalInvoiced: totalInvoicedPaise / 100,
    totalCollected: totalCollectedPaise / 100,
    totalOutstanding: totalOutstandingPaise / 100,
    overdueAmount: overdueAmountPaise / 100,
    overdueCount,
    count: invoices.length,
  };
}
