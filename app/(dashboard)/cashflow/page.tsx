import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getAggregatedCashflowState } from "@/lib/dal/cashflow";
import { CashflowClientView } from "@/components/cashflow/cashflow-client-view";

export const instant = false;

export default async function CashflowPage() {
  const { supabase } = await requireUser();
  const context = await getBusinessContext();

  if (!context.business) {
    return (
      <div className="p-8 text-center text-slate-500">
        No business profile found. Please complete business setup.
      </div>
    );
  }

  const aggregatedState = await getAggregatedCashflowState(supabase, context.business.id);

  return <CashflowClientView initialData={aggregatedState} />;
}
