import React from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getCustomers } from "@/lib/dal/customers";
import { CustomersClientView } from "@/components/customers/customers-client-view";

export default async function CustomersPage({
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

  const initialCustomers = await getCustomers(supabase, context.business.id);

  return (
    <CustomersClientView
      initialCustomers={initialCustomers}
      businessName={context.business.name}
      initialSearch={initialSearch}
    />
  );
}
