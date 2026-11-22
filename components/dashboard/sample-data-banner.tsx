import React from "react";
import { Sparkles, ShieldCheck } from "lucide-react";

interface SampleDataBannerProps {
  businessName?: string;
}

export function SampleDataBanner({ businessName }: SampleDataBannerProps) {
  const displayName = businessName || "FeePulse Workspace";

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 border border-indigo-100 text-xs text-slate-700 shadow-2xs">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-indigo-600/10 text-indigo-700 shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <span className="font-semibold text-slate-900">
            {displayName}
          </span>{" "}
          <span className="text-slate-400">•</span>{" "}
          <span className="text-slate-600">
            Live PostgreSQL Cashflow Ledger &amp; Student Receivables Engine
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-white/90 border border-emerald-200/60 px-2.5 py-1 rounded-md shrink-0 shadow-2xs">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Live Multi-Tenant Database</span>
      </div>
    </div>
  );
}

export const BusinessOverviewBanner = SampleDataBanner;
