'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser, handleActionError } from '@/lib/auth/require-user';
import { getBusinessContext, type BusinessContext } from '@/lib/auth/get-business-context';
import { isValidCurrencyPrecision } from '@/lib/dal/invoices';

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: Record<string, string[]> };

export const UpdateSettingsSchema = z.object({
  academyName: z.string().trim().min(1, 'Academy name is required.').max(100, 'Academy name too long.'),
  openingCashBalance: z
    .number({ invalid_type_error: 'Opening balance must be a number' })
    .min(0, 'Opening balance cannot be negative')
    .refine(isValidCurrencyPrecision, 'Opening balance cannot have more than 2 decimal places'),
  defaultPaymentTermsDays: z
    .number({ invalid_type_error: 'Payment terms must be an integer' })
    .int('Payment terms must be whole days')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms cannot exceed 365 days'),
  upiId: z
    .string()
    .trim()
    .max(100, 'UPI ID is too long')
    .optional()
    .nullable()
    .or(z.literal('')),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, 'Invoice prefix is required')
    .max(10, 'Invoice prefix cannot exceed 10 characters'),
  monthlyBurnTarget: z
    .number({ invalid_type_error: 'Monthly reserve target must be a number' })
    .min(0, 'Monthly reserve target cannot be negative')
    .refine(isValidCurrencyPrecision, 'Reserve target cannot have more than 2 decimal places')
    .optional()
    .nullable(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

/**
 * Server Action: Loads the current business profile and settings.
 */
export async function getSettingsAction(): Promise<ActionResult<BusinessContext>> {
  try {
    await requireUser();
    const context = await getBusinessContext();
    return { success: true, data: context };
  } catch (err: unknown) {
    console.error('getSettingsAction error:', err);
    return handleActionError(err, 'Failed to retrieve settings.');
  }
}

/**
 * Server Action: Updates academy profile and financial settings.
 */
export async function updateSettingsAction(
  input: UpdateSettingsInput
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const { supabase } = await requireUser();
    const context = await getBusinessContext();

    if (!context.business) {
      return { success: false, error: 'No active business profile found for this account.' };
    }

    const validation = UpdateSettingsSchema.safeParse(input);
    if (!validation.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please check the settings form.',
        details: fieldErrors,
      };
    }

    const {
      academyName,
      openingCashBalance,
      defaultPaymentTermsDays,
      upiId,
      invoicePrefix,
      monthlyBurnTarget,
    } = validation.data;

    // 1. Update business name if changed
    if (academyName !== context.business.name) {
      const { error: bizErr } = await supabase
        .from('businesses')
        .update({ name: academyName, updated_at: new Date().toISOString() })
        .eq('id', context.business.id);

      if (bizErr) {
        throw new Error(`Failed to update academy name: ${bizErr.message}`);
      }
    }

    // 2. Upsert business settings
    const settingsPayload = {
      business_id: context.business.id,
      opening_cash_balance: openingCashBalance,
      default_payment_terms_days: defaultPaymentTermsDays,
      upi_id: upiId ? upiId.trim() : null,
      invoice_prefix: invoicePrefix,
      monthly_burn_target: monthlyBurnTarget ?? 0,
      updated_at: new Date().toISOString(),
    };

    const { error: setErr } = await supabase
      .from('business_settings')
      .upsert(settingsPayload, { onConflict: 'business_id' });

    if (setErr) {
      throw new Error(`Failed to save business settings: ${setErr.message}`);
    }

    revalidatePath('/settings');
    revalidatePath('/cashflow');
    revalidatePath('/invoices');
    revalidatePath('/recovery-queue');
    revalidatePath('/');

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    console.error('updateSettingsAction error:', err);
    return handleActionError(err, 'Failed to update settings.');
  }
}
