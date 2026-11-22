import React from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { getCustomers } from "@/lib/dal/customers";
import { generateNextInvoiceNumber } from "@/lib/dal/invoices";
import { NewInvoiceClientView } from "@/components/invoices/new-invoice-client-view";

export const instant = false;

interface NewInvoicePageProps {
  searchParams?: Promise<{ customerId?: string }>;
}

export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  const { supabase } = await requireUser();
  const context = await getBusinessContext();

  const businessId = context.business?.id;
  const businessName = context.business?.name || "FeePulse Academy";
  const prefix = context.settings?.invoice_prefix || "INV-";

  const customers = businessId
    ? await getCustomers(supabase, businessId, { status: "active" })
    : [];

  const nextInvoiceNumber = businessId
    ? await generateNextInvoiceNumber(supabase, businessId, prefix)
    : "INV-0001";

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const preselectedCustomerId = resolvedSearchParams?.customerId;

  return (
    <NewInvoiceClientView
      customers={customers}
      initialInvoiceNumber={nextInvoiceNumber}
      businessName={businessName}
      preselectedCustomerId={preselectedCustomerId}
    />
  );
}
