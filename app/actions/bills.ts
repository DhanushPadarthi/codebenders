'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { getBusinessContext } from '@/lib/auth/get-business-context';
import {
  getBills,
  getBillById,
  createBill,
  updateBill,
  markBillAsPaid,
  archiveBill,
  getExpenseSummaryMetrics,
  CreateBillSchema,
  UpdateBillSchema,
  MarkBillPaidSchema,
  type BillRecord,
  type ExpenseSummaryMetrics,
  type CreateBillInput,
  type UpdateBillInput,
  type MarkBillPaidInput,
} from '@/lib/dal/bills';
import type { BillStatus } from '@/types/database.types';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: Record<string, string[]> };

/**
 * Server Action: Fetches bills for the authenticated business.
 */
export async function getBillsAction(options?: {
  status?: BillStatus | 'ALL';
  category?: string;
  search?: string;
  includeArchived?: boolean;
}): Promise<ActionResult<BillRecord[]>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const bills = await getBills(supabase, context.business.id, options);
    return { success: true, data: bills };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve bills.';
    console.error('getBillsAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Fetches a single bill by ID.
 */
export async function getBillByIdAction(id: string): Promise<ActionResult<BillRecord | null>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const bill = await getBillById(supabase, context.business.id, id);
    return { success: true, data: bill };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve bill.';
    console.error('getBillByIdAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Creates a new operating overhead/bill record.
 */
export async function createBillAction(input: CreateBillInput): Promise<ActionResult<BillRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = CreateBillSchema.safeParse(input);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please verify expense title, amount, and category.',
        details: fieldErrors,
      };
    }

    const bill = await createBill(supabase, context.business.id, validation.data);

    revalidatePath('/expenses');
    revalidatePath('/cashflow');
    revalidatePath('/');

    return { success: true, data: bill };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record bill.';
    console.error('createBillAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Updates an existing bill.
 */
export async function updateBillAction(
  id: string,
  input: UpdateBillInput
): Promise<ActionResult<BillRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = UpdateBillSchema.safeParse(input);
    if (!validation.success) {
      return { success: false, error: 'Validation failed on bill update.' };
    }

    const bill = await updateBill(supabase, context.business.id, id, validation.data);

    revalidatePath('/expenses');
    revalidatePath('/cashflow');
    revalidatePath('/');

    return { success: true, data: bill };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update bill.';
    console.error('updateBillAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Marks a bill as paid.
 */
export async function markBillPaidAction(
  id: string,
  input: MarkBillPaidInput
): Promise<ActionResult<BillRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = MarkBillPaidSchema.safeParse(input);
    if (!validation.success) {
      return { success: false, error: 'Invalid settlement data.' };
    }

    const bill = await markBillAsPaid(supabase, context.business.id, id, validation.data);

    revalidatePath('/expenses');
    revalidatePath('/cashflow');
    revalidatePath('/');

    return { success: true, data: bill };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record bill settlement.';
    console.error('markBillPaidAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Soft-deletes / archives a bill.
 */
export async function archiveBillAction(id: string): Promise<ActionResult<boolean>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const success = await archiveBill(supabase, context.business.id, id);

    revalidatePath('/expenses');
    revalidatePath('/cashflow');
    revalidatePath('/');

    return { success: true, data: success };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to archive bill.';
    console.error('archiveBillAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Calculates expense summary metrics in integer paise.
 */
export async function getExpenseSummaryAction(
  asOfDate?: string
): Promise<ActionResult<ExpenseSummaryMetrics>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const metrics = await getExpenseSummaryMetrics(supabase, context.business.id, asOfDate);
    return { success: true, data: metrics };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute expense metrics.';
    console.error('getExpenseSummaryAction error:', message);
    return { success: false, error: message };
  }
}
