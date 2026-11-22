'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser, handleActionError } from '@/lib/auth/require-user';
import { getBusinessContext } from '@/lib/auth/get-business-context';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  archiveCustomer,
  CreateCustomerSchema,
  UpdateCustomerSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
  type CustomerRecord,
} from '@/lib/dal/customers';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: Record<string, string[]> };

/**
 * Server Action: Fetches all active customers for the authenticated tutor's business.
 */
export async function getCustomersAction(options?: {
  search?: string;
  status?: string;
  batch?: string;
  includeArchived?: boolean;
}): Promise<ActionResult<CustomerRecord[]>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const customers = await getCustomers(supabase, context.business.id, options);
    return { success: true, data: customers };
  } catch (err: unknown) {
    console.error('getCustomersAction error:', err);
    return handleActionError(err, 'Failed to retrieve customers.');
  }
}

/**
 * Server Action: Enrolls a new student for the authenticated tutor's business.
 */
export async function createCustomerAction(
  input: CreateCustomerInput
): Promise<ActionResult<CustomerRecord>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = CreateCustomerSchema.safeParse(input);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please check the form fields.',
        details: fieldErrors,
      };
    }

    const newCustomer = await createCustomer(supabase, context.business.id, validation.data);
    revalidatePath('/customers');

    return { success: true, data: newCustomer };
  } catch (err: unknown) {
    console.error('createCustomerAction error:', err);
    return handleActionError(err, 'Failed to enroll student.');
  }
}

/**
 * Server Action: Updates an existing student record for the authenticated tutor's business.
 */
export async function updateCustomerAction(
  id: string,
  input: UpdateCustomerInput
): Promise<ActionResult<CustomerRecord>> {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Invalid customer ID provided.' };
    }

    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = UpdateCustomerSchema.safeParse(input);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please check the updated fields.',
        details: fieldErrors,
      };
    }

    const updated = await updateCustomer(supabase, context.business.id, id, validation.data);
    revalidatePath('/customers');

    return { success: true, data: updated };
  } catch (err: unknown) {
    console.error('updateCustomerAction error:', err);
    return handleActionError(err, 'Failed to update student.');
  }
}

/**
 * Server Action: Soft-deletes a student record (sets deleted_at = NOW()).
 * Direct physical deletion is revoked at PostgreSQL RLS level.
 */
export async function archiveCustomerAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return { success: false, error: 'Invalid customer ID provided.' };
    }

    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    await archiveCustomer(supabase, context.business.id, id);
    revalidatePath('/customers');

    return { success: true, data: { id } };
  } catch (err: unknown) {
    console.error('archiveCustomerAction error:', err);
    return handleActionError(err, 'Failed to archive student.');
  }
}
