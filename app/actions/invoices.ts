'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser, handleActionError } from '@/lib/auth/require-user';
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
    console.error('getInvoicesAction error:', err);
    return handleActionError(err, 'Failed to retrieve invoices.');
  }
}

/**
 * Server Action: Fetches a single invoice by ID with line items.
 */
export async function getInvoiceByIdAction(
  id: string
): Promise<ActionResult<InvoiceRecord | null>> {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Invalid invoice ID format.' };
    }

    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const invoice = await getInvoiceById(supabase, context.business.id, id);
    return { success: true, data: invoice };
  } catch (err: unknown) {
    console.error('getInvoiceByIdAction error:', err);
    return handleActionError(err, 'Failed to retrieve invoice.');
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
    console.error('getNextInvoiceNumberAction error:', err);
    return handleActionError(err, 'Failed to generate invoice number.');
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
    console.error('createInvoiceAction error:', err);
    return handleActionError(err, 'Failed to create invoice.');
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
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Invalid invoice ID format.' };
    }

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
    console.error('updateDraftInvoiceAction error:', err);
    return handleActionError(err, 'Failed to update invoice.');
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
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Invalid invoice ID format.' };
    }

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
    console.error('transitionInvoiceStatusAction error:', err);
    return handleActionError(err, 'Failed to transition invoice status.');
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
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Invalid invoice ID format.' };
    }

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
    console.error('archiveInvoiceAction error:', err);
    return handleActionError(err, 'Failed to archive invoice.');
  }
}
