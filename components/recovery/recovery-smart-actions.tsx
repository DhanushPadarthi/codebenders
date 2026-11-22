"use client";

import React from "react";
import { CustomerRecoveryItem } from "@/lib/finance/recovery-scoring";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/formatters";
import {
  Zap,
  Clock,
  Send,
  PhoneCall,
  CreditCard,
} from "lucide-react";

interface RecoverySmartActionsProps {
  items: CustomerRecoveryItem[];
  onOpenReminder: (item: CustomerRecoveryItem) => void;
  onOpenFollowUp: (item: CustomerRecoveryItem) => void;
  onOpenRecordPayment: (item: CustomerRecoveryItem) => void;
}

export function RecoverySmartActions({
  items,
  onOpenReminder,
  onOpenFollowUp,
  onOpenRecordPayment,
}: RecoverySmartActionsProps) {
  // Pick top 3 urgent/actionable items
  const urgentActions = items.slice(0, 3);

  if (urgentActions.length === 0) {
    return null;
  }

  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
              <Zap className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-white">
                Smart Recovery Action Queue
              </CardTitle>
              <p className="text-slate-300 text-xs">
                Highest-leverage recovery tasks ranked deterministically by broken promises, days overdue, and amounts.
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-semibold">
            {urgentActions.length} Priority Actions
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-3">
        {urgentActions.map((item, idx) => {
          const isBroken = item.activePromise?.status === "broken";
          const todayStr = new Date().toISOString().slice(0, 10);
          const isDueToday = item.activePromise?.status === "pending" && item.activePromise.promisedDate === todayStr;

          return (
            <div
              key={item.customerId}
              className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isBroken
                  ? "bg-rose-50/40 border-rose-200"
                  : isDueToday
                  ? "bg-amber-50/40 border-amber-200"
                  : "bg-slate-50/70 border-slate-200"
              }`}
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>

                  <span className="font-bold text-sm text-slate-900">
                    {item.studentName}
                  </span>

                  <span className="text-xs text-slate-500">
                    ({item.parentName})
                  </span>

                  {isBroken && (
                    <Badge className="bg-rose-600 text-white text-[10px] py-0">
                      Broken Promise
                    </Badge>
                  )}

                  {isDueToday && (
                    <Badge className="bg-amber-600 text-white text-[10px] py-0">
                      Promise Due Today
                    </Badge>
                  )}

                  <span className="font-mono font-bold text-xs text-rose-700 bg-white px-2 py-0.5 rounded border border-rose-200">
                    {formatINR(item.totalOverdueAmount)} Overdue
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong className="text-slate-800">Recommendation:</strong> {item.recommendedAction}
                </p>

                <div className="flex items-center gap-4 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {item.maxOverdueDays} days past due
                  </span>
                  <span>Invoice(s): {item.invoiceNumbers.join(", ")}</span>
                  <span className="text-indigo-600 font-medium">
                    Priority Score: {item.priorityScore}/100
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => onOpenReminder(item)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Reminder</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenFollowUp(item)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-all"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-slate-500" />
                  <span>Log Follow-Up</span>
                </button>

                {isDueToday && (
                  <button
                    type="button"
                    onClick={() => onOpenRecordPayment(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Record Payment</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
