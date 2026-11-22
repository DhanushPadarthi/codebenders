import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getRecoveryQueueData } from "@/lib/dal/recovery";
import { RecoveryClientView } from "@/components/recovery/recovery-client-view";

export default async function RecoveryQueuePage() {
  const { supabase } = await requireUser();
  const context = await getBusinessContext();

  if (!context.business) {
    return (
      <div className="p-8 text-center text-slate-500">
        No business profile found. Please complete business setup.
      </div>
    );
  }

  const initialData = await getRecoveryQueueData(supabase, context.business.id);

  return <RecoveryClientView initialData={initialData} />;
}
