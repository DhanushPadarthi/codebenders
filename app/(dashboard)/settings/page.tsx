import React from "react";
import { requireUser } from "@/lib/auth/require-user";
import { getBusinessContext } from "@/lib/auth/get-business-context";
import { SettingsClientView } from "@/components/settings/settings-client-view";

export default async function SettingsPage() {
  await requireUser();
  const context = await getBusinessContext();

  return (
    <SettingsClientView
      initialBusiness={context.business}
      initialSettings={context.settings}
      userEmail={context.userEmail}
    />
  );
}
