'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, handleActionError } from '@/lib/auth/require-user';
import { getBusinessContext } from '@/lib/auth/get-business-context';
import {
  getRecoveryQueueData,
  createPaymentPromise,
  updatePaymentPromiseStatus,
  createFollowUpTask,
  updateFollowUpTaskStatus,
  CreatePaymentPromiseSchema,
  UpdatePaymentPromiseSchema,
  CreateFollowUpTaskSchema,
  UpdateFollowUpTaskSchema,
  type CreatePaymentPromiseInput,
  type UpdatePaymentPromiseInput,
  type CreateFollowUpTaskInput,
  type UpdateFollowUpTaskInput,
  type PaymentPromiseRecord,
  type FollowUpTaskRecord,
  type RecoveryQueueData,
} from '@/lib/dal/recovery';
import {
  recordInvoicePayment,
  RecordPaymentSchema,
  type RecordPaymentInput,
  type RecordPaymentResult,
} from '@/lib/dal/payments';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: Record<string, string[]> };

/**
 * Server Action: Loads the real aggregated Smart Recovery Queue from PostgreSQL.
 */
export async function getRecoveryQueueAction(
  asOfDate?: string
): Promise<ActionResult<RecoveryQueueData>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const data = await getRecoveryQueueData(supabase, context.business.id, asOfDate);
    return { success: true, data };
  } catch (err: unknown) {
    console.error('getRecoveryQueueAction error:', err);
    return handleActionError(err, 'Failed to retrieve recovery queue data.');
  }
}

/**
 * Server Action: Creates a verified payment promise.
 */
export async function createPaymentPromiseAction(
  input: CreatePaymentPromiseInput
): Promise<ActionResult<PaymentPromiseRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = CreatePaymentPromiseSchema.safeParse(input);
    if (!validation.success) {
      const details: Record<string, string[]> = {};
      validation.error.errors.forEach((err) => {
        const field = err.path.join('.');
        details[field] = details[field] || [];
        details[field].push(err.message);
      });
      return { success: false, error: 'Invalid promise parameters.', details };
    }

    const record = await createPaymentPromise(supabase, context.business.id, validation.data);

    revalidatePath('/recovery-queue');
    revalidatePath('/cashflow');
    revalidatePath('/invoices');

    return { success: true, data: record };
  } catch (err: unknown) {
    console.error('createPaymentPromiseAction error:', err);
    return handleActionError(err, 'Failed to create payment promise.');
  }
}

/**
 * Server Action: Updates a payment promise status.
 */
export async function updatePaymentPromiseStatusAction(
  input: UpdatePaymentPromiseInput
): Promise<ActionResult<PaymentPromiseRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = UpdatePaymentPromiseSchema.safeParse(input);
    if (!validation.success) {
      const details: Record<string, string[]> = {};
      validation.error.errors.forEach((err) => {
        const field = err.path.join('.');
        details[field] = details[field] || [];
        details[field].push(err.message);
      });
      return { success: false, error: 'Invalid update parameters.', details };
    }

    const record = await updatePaymentPromiseStatus(
      supabase,
      context.business.id,
      validation.data.promiseId,
      validation.data.status
    );

    revalidatePath('/recovery-queue');
    revalidatePath('/cashflow');

    return { success: true, data: record };
  } catch (err: unknown) {
    console.error('updatePaymentPromiseStatusAction error:', err);
    return handleActionError(err, 'Failed to update promise status.');
  }
}

/**
 * Server Action: Creates a follow-up task logging communication history.
 */
export async function createFollowUpTaskAction(
  input: CreateFollowUpTaskInput
): Promise<ActionResult<FollowUpTaskRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = CreateFollowUpTaskSchema.safeParse(input);
    if (!validation.success) {
      const details: Record<string, string[]> = {};
      validation.error.errors.forEach((err) => {
        const field = err.path.join('.');
        details[field] = details[field] || [];
        details[field].push(err.message);
      });
      return { success: false, error: 'Invalid follow-up parameters.', details };
    }

    const record = await createFollowUpTask(supabase, context.business.id, validation.data);

    revalidatePath('/recovery-queue');

    return { success: true, data: record };
  } catch (err: unknown) {
    console.error('createFollowUpTaskAction error:', err);
    return handleActionError(err, 'Failed to log follow-up activity.');
  }
}

/**
 * Server Action: Updates a follow-up task status (pending | completed | dismissed).
 */
export async function updateFollowUpTaskStatusAction(
  input: UpdateFollowUpTaskInput
): Promise<ActionResult<FollowUpTaskRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = UpdateFollowUpTaskSchema.safeParse(input);
    if (!validation.success) {
      const details: Record<string, string[]> = {};
      validation.error.errors.forEach((err) => {
        const field = err.path.join('.');
        details[field] = details[field] || [];
        details[field].push(err.message);
      });
      return { success: false, error: 'Invalid update parameters.', details };
    }

    const record = await updateFollowUpTaskStatus(
      supabase,
      context.business.id,
      validation.data.taskId,
      validation.data.status
    );

    revalidatePath('/recovery-queue');

    return { success: true, data: record };
  } catch (err: unknown) {
    console.error('updateFollowUpTaskStatusAction error:', err);
    return handleActionError(err, 'Failed to update follow-up task.');
  }
}

/**
 * Server Action: Executes payment received workflow through the secure payment RPC
 * and synchronizes follow-up task state upon completion.
 */
export async function recordRecoveryPaymentAction(
  paymentInput: RecordPaymentInput,
  followUpTaskId?: string
): Promise<ActionResult<RecordPaymentResult>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = RecordPaymentSchema.safeParse(paymentInput);
    if (!validation.success) {
      const details: Record<string, string[]> = {};
      validation.error.errors.forEach((err) => {
        const field = err.path.join('.');
        details[field] = details[field] || [];
        details[field].push(err.message);
      });
      return { success: false, error: 'Invalid payment parameters.', details };
    }

    // 1. Execute payment through secure RPC
    const result = await recordInvoicePayment(supabase, context.business.id, validation.data);

    // 2. If follow-up task linked, mark it completed
    if (followUpTaskId) {
      try {
        await updateFollowUpTaskStatus(supabase, context.business.id, followUpTaskId, 'completed');
      } catch (fupErr) {
        console.warn('Could not auto-complete follow-up task:', fupErr);
      }
    }

    // 3. If there are pending promises on this invoice that have been satisfied, fulfill them
    try {
      const { data: pendingPromises } = await supabase
        .from('payment_promises')
        .select('id, promised_amount')
        .eq('business_id', context.business.id)
        .eq('invoice_id', validation.data.invoiceId)
        .eq('status', 'pending');

      if (pendingPromises && pendingPromises.length > 0) {
        for (const p of pendingPromises) {
          try {
            await updatePaymentPromiseStatus(supabase, context.business.id, p.id, 'fulfilled');
          } catch {
            // Partial payment: updatePaymentPromiseStatus will cleanly reject and leave promise pending
          }
        }
      }
    } catch (promErr) {
      console.warn('Could not check pending promises:', promErr);
    }

    revalidatePath('/recovery-queue');
    revalidatePath('/payments');
    revalidatePath('/invoices');
    revalidatePath('/cashflow');

    return { success: true, data: result };
  } catch (err: unknown) {
    console.error('recordRecoveryPaymentAction error:', err);
    return handleActionError(err, 'Failed to record recovery payment.');
  }
}
