import React from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getBills, getExpenseSummaryMetrics } from "@/lib/dal/bills";
import { ExpensesClientView } from "@/components/expenses/expenses-client-view";

export const instant = false;

export default async function ExpensesPage() {
  const { supabase } = await requireUser();
  const context = await getBusinessContext();

  if (!context.business) {
    return (
      <div className="p-8 text-center text-slate-600 bg-white rounded-xl border border-slate-200 mt-6 max-w-lg mx-auto">
        <h2 className="text-lg font-bold text-slate-900">
          Business Profile Initializing
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Your business profile is being established. Please refresh or contact support if this message persists.
        </p>
      </div>
    );
  }

  const [initialBills, metrics] = await Promise.all([
    getBills(supabase, context.business.id),
    getExpenseSummaryMetrics(supabase, context.business.id),
  ]);

  return (
    <ExpensesClientView
      initialBills={initialBills}
      metrics={metrics}
    />
  );
}
