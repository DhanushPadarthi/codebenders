import React from "react";
import { Settings } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { requireUser } from "@/lib/auth/require-user";

export const instant = false;

export default async function SettingsPage() {
  await requireUser();
  return (
    <PlaceholderPage
      title="Academy & Financial Settings"
      badge="Settings • Scheduled"
      description="Configure tuition center profiles, UPI VPA identifier, default invoice prefixes, and reminder preferences."
      icon={Settings}
      roadmapItems={[
        "Opening cash balance and reserve threshold settings",
        "Custom UPI VPA (e.g. sharmaacademy@okhdfcbank) for instant QR codes",
        "Tuition invoice prefix (e.g. SMA-2026-) and default payment terms (e.g. 7 days)",
        "Multi-branch tuition centre setup and staff access rules",
      ]}
    />
  );
}
