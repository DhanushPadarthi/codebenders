'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { getBusinessContext } from '@/lib/auth/get-business-context';
import {
  getInvoices,
  getInvoiceById,
  generateNextInvoiceNumber,
  createInvoice,
  updateDraftInvoice,
  transitionInvoiceStatus,
  softDeleteInvoice,
  CreateInvoiceSchema,
  UpdateDraftInvoiceSchema,
  type CreateCustomerInvoiceInput,
  type UpdateDraftInvoiceInput,
  type InvoiceRecord,
} from '@/lib/dal/invoices';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: Record<string, string[]> };

/**
 * Server Action: Fetches all active invoices for the authenticated tutor's business.
 */
export async function getInvoicesAction(options?: {
  search?: string;
  status?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
  includeArchived?: boolean;
}): Promise<ActionResult<InvoiceRecord[]>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const invoices = await getInvoices(supabase, context.business.id, options);
    return { success: true, data: invoices };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve invoices.';
    console.error('getInvoicesAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Fetches a single invoice by ID with line items.
 */
export async function getInvoiceByIdAction(
  id: string
): Promise<ActionResult<InvoiceRecord | null>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const invoice = await getInvoiceById(supabase, context.business.id, id);
    return { success: true, data: invoice };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve invoice.';
    console.error('getInvoiceByIdAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Generates the next sequential invoice number for this business.
 */
export async function getNextInvoiceNumberAction(): Promise<ActionResult<string>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const prefix = context.settings?.invoice_prefix || 'INV-';
    const nextNumber = await generateNextInvoiceNumber(supabase, context.business.id, prefix);
    return { success: true, data: nextNumber };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate invoice number.';
    console.error('getNextInvoiceNumberAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Creates a new invoice with line items for a student.
 */
export async function createInvoiceAction(
  input: CreateCustomerInvoiceInput
): Promise<ActionResult<InvoiceRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = CreateInvoiceSchema.safeParse(input);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please verify line items and dates.',
        details: fieldErrors,
      };
    }

    const newInvoice = await createInvoice(supabase, context.business.id, validation.data);

    revalidatePath('/invoices');
    revalidatePath('/customers');

    return { success: true, data: newInvoice };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create invoice.';
    console.error('createInvoiceAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Updates an existing draft invoice.
 */
export async function updateDraftInvoiceAction(
  id: string,
  input: UpdateDraftInvoiceInput
): Promise<ActionResult<InvoiceRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = UpdateDraftInvoiceSchema.safeParse(input);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed.',
        details: fieldErrors,
      };
    }

    const updated = await updateDraftInvoice(supabase, context.business.id, id, validation.data);

    revalidatePath('/invoices');
    revalidatePath('/customers');

    return { success: true, data: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update invoice.';
    console.error('updateDraftInvoiceAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Transitions an invoice status (e.g. draft -> sent, or to cancelled).
 */
export async function transitionInvoiceStatusAction(
  id: string,
  newStatus: 'sent' | 'cancelled'
): Promise<ActionResult<{ status: string; previousStatus: string }>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const res = await transitionInvoiceStatus(supabase, context.business.id, id, newStatus);

    revalidatePath('/invoices');
    revalidatePath('/customers');

    return { success: true, data: { status: res.status, previousStatus: res.previousStatus } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to transition invoice status.';
    console.error('transitionInvoiceStatusAction error:', message);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Soft-deletes an invoice using database RPC soft_delete_invoice().
 * Blocked if any payments are recorded.
 */
export async function archiveInvoiceAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    await softDeleteInvoice(supabase, context.business.id, id);

    revalidatePath('/invoices');
    revalidatePath('/customers');

    return { success: true, data: { id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to archive invoice.';
    console.error('archiveInvoiceAction error:', message);
    return { success: false, error: message };
  }
}
