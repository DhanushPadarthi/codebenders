import React from "react";
import { Loader2, Sparkles } from "lucide-react";

export default function AiAssistantLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full p-8 text-slate-500">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse" />
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
      <p className="text-sm font-medium text-slate-700">Loading AI Financial Copilot...</p>
      <p className="text-xs text-slate-400 mt-1">Preparing verified context, students, and invoices</p>
    </div>
  );
}
