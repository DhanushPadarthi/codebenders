import React from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getCustomers } from "@/lib/dal/customers";
import { getInvoices } from "@/lib/dal/invoices";
import { getPayments } from "@/lib/dal/payments";
import { getBills } from "@/lib/dal/bills";
import { getPaymentPromises, getFollowUpTasks } from "@/lib/dal/recovery";
import { DashboardClientView } from "@/components/dashboard/dashboard-client-view";

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const context = await getBusinessContext();

  if (!context.business) {
    return (
      <div className="p-8 text-center text-slate-600 bg-white rounded-xl border border-slate-200 mt-6 max-w-lg mx-auto">
        <h2 className="text-lg font-bold text-slate-900">
          Business Account Initializing
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Your business profile is being established. Please refresh or contact support if this message persists.
        </p>
      </div>
    );
  }

  const businessId = context.business.id;

  // Fetch all core dashboard datasets in parallel from real Supabase PostgreSQL tables
  const [
    customers,
    invoices,
    payments,
    bills,
    promises,
    followUps,
  ] = await Promise.all([
    getCustomers(supabase, businessId),
    getInvoices(supabase, businessId),
    getPayments(supabase, businessId),
    getBills(supabase, businessId),
    getPaymentPromises(supabase, businessId),
    getFollowUpTasks(supabase, businessId),
  ]);

  const openingCashBalance = Number(context.settings?.opening_cash_balance ?? 0);
  const safeReserveThreshold = 50000;

  return (
    <DashboardClientView
      business={{ id: businessId, name: context.business.name }}
      initialData={{
        customers,
        invoices,
        payments,
        bills,
        promises,
        followUps,
        openingCashBalance,
        safeReserveThreshold,
      }}
    />
  );
}
