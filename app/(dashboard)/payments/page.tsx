import React from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getPayments, getPaymentSummaryMetrics } from "@/lib/dal/payments";
import { getInvoices } from "@/lib/dal/invoices";
import { getCustomers } from "@/lib/dal/customers";
import { PaymentsClientView } from "@/components/payments/payments-client-view";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const { supabase } = await requireUser();
  const context = await getBusinessContext();
  const params = await searchParams;
  const initialSearch = params?.search || "";

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

  const [initialPayments, metrics, invoices, customers] = await Promise.all([
    getPayments(supabase, context.business.id),
    getPaymentSummaryMetrics(supabase, context.business.id),
    getInvoices(supabase, context.business.id),
    getCustomers(supabase, context.business.id),
  ]);

  return (
    <PaymentsClientView
      initialPayments={initialPayments}
      metrics={metrics}
      invoices={invoices}
      customers={customers}
      businessName={context.business.name}
      initialSearch={initialSearch}
    />
  );
}
