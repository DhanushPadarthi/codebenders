'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
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
    const message = err instanceof Error ? err.message : 'Failed to retrieve customers.';
    console.error('getCustomersAction error:', message);
    return { success: false, error: message };
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
    const message = err instanceof Error ? err.message : 'Failed to enroll student.';
    console.error('createCustomerAction error:', message);
    return { success: false, error: message };
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
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid customer ID provided.' };
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
    const message = err instanceof Error ? err.message : 'Failed to update student.';
    console.error('updateCustomerAction error:', message);
    return { success: false, error: message };
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
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid customer ID provided.' };
    }

    await archiveCustomer(supabase, context.business.id, id);
    revalidatePath('/customers');

    return { success: true, data: { id } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to archive student.';
    console.error('archiveCustomerAction error:', message);
    return { success: false, error: message };
  }
}
