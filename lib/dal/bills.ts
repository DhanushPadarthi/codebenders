import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { BillCategory, BillStatus } from '@/types/database.types';

type DbClient = Awaited<ReturnType<typeof createClient>>;

export type DbExpenseCategory = BillCategory;
export type RecurrenceFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface BillRawRow {
  id: string;
  business_id: string;
  title: string;
  category: DbExpenseCategory;
  amount: number | string;
  due_date: string;
  is_recurring: boolean;
  recurring_frequency: string | null;
  recurring_day_of_month: number | null;
  recurring_end_date: string | null;
  status: BillStatus;
  paid_date: string | null;
  vendor_name: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillRecord {
  id: string;
  businessId: string;
  title: string;
  vendorName: string;
  category: DbExpenseCategory;
  uiCategory: string;
  amount: number;
  amountPaise: number;
  dueDate: string;
  status: BillStatus;
  isRecurring: boolean;
  recurringFrequency?: RecurrenceFrequency;
  recurringDayOfMonth?: number;
  recurringEndDate?: string;
  paidDate?: string;
  notes?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSummaryMetrics {
  totalThisMonth: number;
  totalThisMonthPaise: number;
  upcomingExpenses: number;
  upcomingExpensesPaise: number;
  overdueExpenses: number;
  overdueExpensesPaise: number;
  paidThisMonth: number;
  paidThisMonthPaise: number;
  totalPaidAllTime: number;
  totalPaidAllTimePaise: number;
  recurringMonthlyProjection: number;
  recurringMonthlyProjectionPaise: number;
  upcomingCount: number;
  overdueCount: number;
  paidCount: number;
  categoryBreakdown: Record<string, number>;
}

export const VALID_CATEGORIES: DbExpenseCategory[] = [
  'rent',
  'electricity',
  'internet',
  'salary',
  'materials',
  'software',
  'other',
];

export function dbCategoryToUi(cat: DbExpenseCategory): string {
  switch (cat) {
    case 'salary':
      return 'Salary/Honorarium';
    case 'rent':
      return 'Rent';
    case 'electricity':
      return 'Electricity';
    case 'internet':
      return 'Internet';
    case 'materials':
      return 'Materials';
    case 'software':
      return 'Software';
    case 'other':
    default:
      return 'Other';
  }
}

export function uiCategoryToDb(cat: string): DbExpenseCategory {
  const lower = cat.toLowerCase();
  if (lower.includes('salary') || lower.includes('honorarium')) return 'salary';
  if (lower === 'rent') return 'rent';
  if (lower === 'electricity') return 'electricity';
  if (lower === 'internet') return 'internet';
  if (lower === 'materials') return 'materials';
  if (lower === 'software') return 'software';
  return 'other';
}

export const CreateBillSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title too long'),
  vendorName: z.string().trim().max(200).optional().nullable(),
  category: z.enum(['rent', 'electricity', 'internet', 'salary', 'materials', 'software', 'other']),
  amount: z.number().positive('Expense amount must be greater than zero'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format'),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(['monthly', 'quarterly', 'yearly']).optional().nullable(),
  recurringDayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  recurringEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type CreateBillInput = z.infer<typeof CreateBillSchema>;

export const UpdateBillSchema = CreateBillSchema.partial();
export type UpdateBillInput = z.infer<typeof UpdateBillSchema>;

export const MarkBillPaidSchema = z.object({
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Paid date must be YYYY-MM-DD').optional(),
  paymentMethod: z.string().trim().max(100).optional(),
  paymentReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type MarkBillPaidInput = z.infer<typeof MarkBillPaidSchema>;

/**
 * Maps a database bill row to a typed BillRecord with integer-paise precision.
 */
export function mapBillRow(row: BillRawRow): BillRecord {
  const amountNumber = Number(row.amount ?? 0);
  const amountPaise = Math.round(amountNumber * 100);
  const amount = amountPaise / 100;

  return {
    id: row.id,
    businessId: row.business_id,
    title: row.title,
    vendorName: row.vendor_name || '—',
    category: row.category,
    uiCategory: dbCategoryToUi(row.category),
    amount,
    amountPaise,
    dueDate: row.due_date,
    status: row.status,
    isRecurring: Boolean(row.is_recurring),
    recurringFrequency: (row.recurring_frequency as RecurrenceFrequency) || undefined,
    recurringDayOfMonth: row.recurring_day_of_month || undefined,
    recurringEndDate: row.recurring_end_date || undefined,
    paidDate: row.paid_date || undefined,
    notes: row.notes || undefined,
    deletedAt: row.deleted_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetches bills for the authenticated business with optional filters.
 * Excludes soft-deleted bills by default.
 */
export async function getBills(
  supabase: DbClient,
  businessId: string,
  options?: {
    status?: BillStatus | 'ALL';
    category?: string;
    search?: string;
    includeArchived?: boolean;
  }
): Promise<BillRecord[]> {
  let query = supabase
    .from('bills')
    .select('*')
    .eq('business_id', businessId)
    .order('due_date', { ascending: true });

  if (!options?.includeArchived) {
    query = query.is('deleted_at', null);
  }

  if (options?.status && options.status !== 'ALL') {
    query = query.eq('status', options.status);
  }

  if (options?.category && options.category !== 'ALL') {
    const dbCat = uiCategoryToDb(options.category);
    query = query.eq('category', dbCat);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to retrieve bills: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  let mapped = (data as BillRawRow[]).map(mapBillRow);

  if (options?.search && options.search.trim()) {
    const q = options.search.toLowerCase().trim();
    mapped = mapped.filter((b) => {
      return (
        b.title.toLowerCase().includes(q) ||
        b.vendorName.toLowerCase().includes(q) ||
        (b.notes && b.notes.toLowerCase().includes(q))
      );
    });
  }

  return mapped;
}

/**
 * Fetches a single bill by ID.
 */
export async function getBillById(
  supabase: DbClient,
  businessId: string,
  id: string
): Promise<BillRecord | null> {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('business_id', businessId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to retrieve bill ${id}: ${error.message}`);
  }

  if (!data) return null;
  return mapBillRow(data as BillRawRow);
}

/**
 * Inserts a new bill record with server-derived business ID.
 */
export async function createBill(
  supabase: DbClient,
  businessId: string,
  input: CreateBillInput
): Promise<BillRecord> {
  const validated = CreateBillSchema.parse(input);

  const amountPaise = Math.round(validated.amount * 100);
  const normalizedAmount = amountPaise / 100;

  const insertPayload = {
    business_id: businessId,
    title: validated.title,
    vendor_name: validated.vendorName || null,
    category: validated.category,
    amount: normalizedAmount,
    due_date: validated.dueDate,
    is_recurring: validated.isRecurring,
    recurring_frequency: validated.isRecurring ? validated.recurringFrequency || 'monthly' : null,
    recurring_day_of_month: validated.isRecurring
      ? validated.recurringDayOfMonth || parseInt(validated.dueDate.slice(-2), 10) || 1
      : null,
    recurring_end_date: validated.isRecurring ? validated.recurringEndDate || null : null,
    status: 'unpaid' as BillStatus,
    notes: validated.notes || null,
  };

  const { data, error } = await supabase
    .from('bills')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create bill: ${error?.message || 'Unknown database error'}`);
  }

  return mapBillRow(data as BillRawRow);
}

/**
 * Updates an existing bill.
 */
export async function updateBill(
  supabase: DbClient,
  businessId: string,
  id: string,
  input: UpdateBillInput
): Promise<BillRecord> {
  const validated = UpdateBillSchema.parse(input);

  const updatePayload: Record<string, unknown> = {};
  if (validated.title !== undefined) updatePayload.title = validated.title;
  if (validated.vendorName !== undefined) updatePayload.vendor_name = validated.vendorName;
  if (validated.category !== undefined) updatePayload.category = validated.category;
  if (validated.amount !== undefined) {
    updatePayload.amount = Math.round(validated.amount * 100) / 100;
  }
  if (validated.dueDate !== undefined) updatePayload.due_date = validated.dueDate;
  if (validated.isRecurring !== undefined) {
    updatePayload.is_recurring = validated.isRecurring;
    if (!validated.isRecurring) {
      updatePayload.recurring_frequency = null;
      updatePayload.recurring_day_of_month = null;
      updatePayload.recurring_end_date = null;
    }
  }
  if (validated.recurringFrequency !== undefined) {
    updatePayload.recurring_frequency = validated.recurringFrequency;
  }
  if (validated.recurringDayOfMonth !== undefined) {
    updatePayload.recurring_day_of_month = validated.recurringDayOfMonth;
  }
  if (validated.recurringEndDate !== undefined) {
    updatePayload.recurring_end_date = validated.recurringEndDate;
  }
  if (validated.notes !== undefined) updatePayload.notes = validated.notes;

  const { data, error } = await supabase
    .from('bills')
    .update(updatePayload)
    .eq('business_id', businessId)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update bill ${id}: ${error?.message || 'Unknown database error'}`);
  }

  return mapBillRow(data as BillRawRow);
}

/**
 * Marks a bill as paid with settlement metadata.
 */
export async function markBillAsPaid(
  supabase: DbClient,
  businessId: string,
  id: string,
  input: MarkBillPaidInput
): Promise<BillRecord> {
  const validated = MarkBillPaidSchema.parse(input);

  const paidDate = validated.paidDate || new Date().toISOString().slice(0, 10);

  // Retrieve existing bill notes to append reference cleanly
  const existing = await getBillById(supabase, businessId, id);
  if (!existing) {
    throw new Error(`Bill ${id} not found.`);
  }

  let updatedNotes = existing.notes || '';
  if (validated.paymentMethod || validated.paymentReference) {
    const meta = `[Settled via ${validated.paymentMethod || 'UPI'}${
      validated.paymentReference ? ` Ref: ${validated.paymentReference}` : ''
    }]`;
    updatedNotes = updatedNotes ? `${updatedNotes} • ${meta}` : meta;
  }
  if (validated.notes) {
    updatedNotes = updatedNotes ? `${updatedNotes}\n${validated.notes}` : validated.notes;
  }

  const { data, error } = await supabase
    .from('bills')
    .update({
      status: 'paid',
      paid_date: paidDate,
      notes: updatedNotes || null,
    })
    .eq('business_id', businessId)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to mark bill ${id} as paid: ${error?.message}`);
  }

  return mapBillRow(data as BillRawRow);
}

/**
 * Soft-deletes a bill by setting deleted_at = NOW().
 * Physical DELETE is revoked by PostgreSQL RLS.
 */
export async function archiveBill(
  supabase: DbClient,
  businessId: string,
  id: string
): Promise<boolean> {
  const { error } = await supabase
    .from('bills')
    .update({ deleted_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to archive bill ${id}: ${error.message}`);
  }

  return true;
}

/**
 * Calculates precision-safe expense summary metrics in integer paise.
 */
export async function getExpenseSummaryMetrics(
  supabase: DbClient,
  businessId: string,
  asOfDate?: string
): Promise<ExpenseSummaryMetrics> {
  const currentDate = asOfDate || new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = currentDate.slice(0, 7);

  const bills = await getBills(supabase, businessId, { includeArchived: false });

  let paidThisMonthPaise = 0;
  let totalPaidAllTimePaise = 0;
  let upcomingExpensesPaise = 0;
  let overdueExpensesPaise = 0;
  let recurringMonthlyProjectionPaise = 0;

  let upcomingCount = 0;
  let overdueCount = 0;
  let paidCount = 0;

  const categoryBreakdownPaise: Record<string, number> = {};

  for (const b of bills) {
    const amountPaise = b.amountPaise;

    // Track category breakdown
    categoryBreakdownPaise[b.uiCategory] = (categoryBreakdownPaise[b.uiCategory] || 0) + amountPaise;

    if (b.status === 'paid') {
      totalPaidAllTimePaise += amountPaise;
      paidCount += 1;
      const isPaidThisMonth =
        (b.paidDate && b.paidDate.startsWith(currentMonthPrefix)) ||
        (!b.paidDate && b.dueDate.startsWith(currentMonthPrefix));
      if (isPaidThisMonth) {
        paidThisMonthPaise += amountPaise;
      }
    } else {
      const isOverdue = b.status === 'overdue' || b.dueDate < currentDate;
      if (isOverdue) {
        overdueExpensesPaise += amountPaise;
        overdueCount += 1;
      } else {
        upcomingExpensesPaise += amountPaise;
        upcomingCount += 1;
      }
    }

    if (b.isRecurring) {
      if (b.recurringFrequency === 'monthly' || !b.recurringFrequency) {
        recurringMonthlyProjectionPaise += amountPaise;
      } else if (b.recurringFrequency === 'quarterly') {
        recurringMonthlyProjectionPaise += Math.round(amountPaise / 3);
      } else if (b.recurringFrequency === 'yearly') {
        recurringMonthlyProjectionPaise += Math.round(amountPaise / 12);
      }
    }
  }

  // Total this month = paid this month + unpaid due this month
  let unpaidThisMonthPaise = 0;
  for (const b of bills) {
    if (b.status !== 'paid' && b.dueDate.startsWith(currentMonthPrefix)) {
      unpaidThisMonthPaise += b.amountPaise;
    }
  }
  const totalThisMonthPaise = paidThisMonthPaise + unpaidThisMonthPaise;

  const categoryBreakdown: Record<string, number> = {};
  for (const [cat, p] of Object.entries(categoryBreakdownPaise)) {
    categoryBreakdown[cat] = p / 100;
  }

  return {
    totalThisMonth: totalThisMonthPaise / 100,
    totalThisMonthPaise,
    upcomingExpenses: upcomingExpensesPaise / 100,
    upcomingExpensesPaise,
    overdueExpenses: overdueExpensesPaise / 100,
    overdueExpensesPaise,
    paidThisMonth: paidThisMonthPaise / 100,
    paidThisMonthPaise,
    totalPaidAllTime: totalPaidAllTimePaise / 100,
    totalPaidAllTimePaise,
    recurringMonthlyProjection: recurringMonthlyProjectionPaise / 100,
    recurringMonthlyProjectionPaise,
    upcomingCount,
    overdueCount,
    paidCount,
    categoryBreakdown,
  };
}
