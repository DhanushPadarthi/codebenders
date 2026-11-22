import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getCustomers } from "@/lib/dal/customers";
import { getInvoices } from "@/lib/dal/invoices";
import { getPaymentPromises } from "@/lib/dal/recovery";
import { getBills } from "@/lib/dal/bills";
import { AiAssistantClientView } from "@/components/ai/ai-assistant-client-view";

export default async function AiAssistantPage() {
  const { supabase } = await requireUser();
  const context = await getBusinessContext();

  if (!context.business) {
    redirect("/onboarding");
  }

  const businessId = context.business.id;

  const [customers, invoices, promises, bills] = await Promise.all([
    getCustomers(supabase, businessId),
    getInvoices(supabase, businessId),
    getPaymentPromises(supabase, businessId),
    getBills(supabase, businessId),
  ]);

  const businessName = context.business.name || "Coaching Academy";
  const upiId = context.settings?.upi_id || undefined;

  return (
    <AiAssistantClientView
      customers={customers}
      invoices={invoices}
      promises={promises}
      bills={bills}
      businessName={businessName}
      businessPaymentDetails={upiId ? `UPI ID: ${upiId}` : undefined}
    />
  );
}
