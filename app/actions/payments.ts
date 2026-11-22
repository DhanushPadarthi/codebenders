'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser, handleActionError } from '@/lib/auth/require-user';
import { getBusinessContext } from '@/lib/auth/get-business-context';
import {
  getPayments,
  getPaymentById,
  getPaymentsByInvoiceId,
  getPaymentsByCustomerId,
  getPaymentSummaryMetrics,
  recordInvoicePayment,
  RecordPaymentSchema,
  type PaymentRecord,
  type PaymentSummaryMetrics,
  type RecordPaymentInput,
  type RecordPaymentResult,
  type PaymentMode,
} from '@/lib/dal/payments';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: Record<string, string[]> };

/**
 * Server Action: Fetches payment history for the authenticated tutor's academy.
 */
export async function getPaymentsAction(options?: {
  customerId?: string;
  invoiceId?: string;
  paymentMode?: PaymentMode;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<ActionResult<PaymentRecord[]>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const payments = await getPayments(supabase, context.business.id, options);
    return { success: true, data: payments };
  } catch (err: unknown) {
    console.error('getPaymentsAction error:', err);
    return handleActionError(err, 'Failed to retrieve payment records.');
  }
}

/**
 * Server Action: Fetches a single payment record by ID.
 */
export async function getPaymentByIdAction(
  id: string
): Promise<ActionResult<PaymentRecord | null>> {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Invalid payment ID format.' };
    }

    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const payment = await getPaymentById(supabase, context.business.id, id);
    return { success: true, data: payment };
  } catch (err: unknown) {
    console.error('getPaymentByIdAction error:', err);
    return handleActionError(err, 'Failed to retrieve payment record.');
  }
}

/**
 * Server Action: Fetches all payments recorded against a specific invoice.
 */
export async function getPaymentsByInvoiceAction(
  invoiceId: string
): Promise<ActionResult<PaymentRecord[]>> {
  try {
    if (!z.string().uuid().safeParse(invoiceId).success) {
      return { success: false, error: 'Invalid invoice ID format.' };
    }

    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const payments = await getPaymentsByInvoiceId(supabase, context.business.id, invoiceId);
    return { success: true, data: payments };
  } catch (err: unknown) {
    console.error('getPaymentsByInvoiceAction error:', err);
    return handleActionError(err, 'Failed to retrieve invoice payment history.');
  }
}

/**
 * Server Action: Fetches all payments recorded for a specific student.
 */
export async function getPaymentsByCustomerAction(
  customerId: string
): Promise<ActionResult<PaymentRecord[]>> {
  try {
    if (!z.string().uuid().safeParse(customerId).success) {
      return { success: false, error: 'Invalid customer ID format.' };
    }

    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const payments = await getPaymentsByCustomerId(supabase, context.business.id, customerId);
    return { success: true, data: payments };
  } catch (err: unknown) {
    console.error('getPaymentsByCustomerAction error:', err);
    return handleActionError(err, 'Failed to retrieve student payment history.');
  }
}

/**
 * Server Action: Computes payment summary metrics (total collected, by payment method, today, this month).
 */
export async function getPaymentSummaryAction(): Promise<ActionResult<PaymentSummaryMetrics>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const metrics = await getPaymentSummaryMetrics(supabase, context.business.id);
    return { success: true, data: metrics };
  } catch (err: unknown) {
    console.error('getPaymentSummaryAction error:', err);
    return handleActionError(err, 'Failed to compute payment summary.');
  }
}

/**
 * Server Action: Records an invoice payment using database RPC public.record_invoice_payment().
 * Revalidates affected dashboard, invoices, payments, and customer routes.
 */
export async function recordPaymentAction(
  input: RecordPaymentInput
): Promise<ActionResult<RecordPaymentResult>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = RecordPaymentSchema.safeParse(input);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please verify payment amount and method.',
        details: fieldErrors,
      };
    }

    const result = await recordInvoicePayment(supabase, context.business.id, validation.data);

    // Revalidate affected views
    revalidatePath('/payments');
    revalidatePath('/invoices');
    revalidatePath('/customers');
    revalidatePath('/cashflow');
    revalidatePath('/recovery-queue');
    revalidatePath('/');

    return { success: true, data: result };
  } catch (err: unknown) {
    console.error('recordPaymentAction error:', err);
    return handleActionError(err, 'Failed to record payment.');
  }
}
