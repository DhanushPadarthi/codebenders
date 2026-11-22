import { cache } from 'react';
import { requireUser } from './require-user';

export interface BusinessEntity {
  id: string;
  owner_id: string;
  name: string;
  currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessSettingsEntity {
  id: string;
  business_id: string;
  opening_cash_balance: number;
  default_payment_terms_days: number;
  upi_id: string | null;
  upi_qr_code_url: string | null;
  invoice_prefix: string;
  monthly_burn_target: number | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessContext {
  userId: string;
  userEmail: string;
  userName: string;
  business: BusinessEntity | null;
  settings: BusinessSettingsEntity | null;
}

/**
 * Reusable server-side business-context helper.
 * Strictly relies on verified user session and PostgreSQL RLS.
 * Never trusts client-supplied business IDs.
 * Memoized per-request with React cache() to prevent redundant database queries.
 */
export const getBusinessContext = cache(async (): Promise<BusinessContext> => {
  const { user, supabase } = await requireUser();

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bizError) {
    console.error('Error fetching business context:', bizError.message);
  }

  let settings: BusinessSettingsEntity | null = null;
  if (business?.id) {
    const { data: settingsData, error: setErrors } = await supabase
      .from('business_settings')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();

    if (setErrors) {
      console.error('Error fetching business settings:', setErrors.message);
    } else {
      settings = settingsData as BusinessSettingsEntity;
    }
  }

  const userName =
    (user.user_metadata?.full_name as string) ||
    user.email?.split('@')[0] ||
    'Tutor';

  return {
    userId: user.id,
    userEmail: user.email || '',
    userName,
    business: business as BusinessEntity | null,
    settings,
  };
});
