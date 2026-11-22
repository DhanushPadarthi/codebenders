"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import { RecoveryQueueDashboardStats } from "@/lib/finance/recovery-scoring";
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  Flame,
  CalendarCheck,
  CheckCircle2,
} from "lucide-react";

interface RecoveryKpiCardsProps {
  stats: RecoveryQueueDashboardStats;
}

export function RecoveryKpiCards({ stats }: RecoveryKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Total Overdue Invoices */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Overdue Invoices
            </span>
            <div className="p-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-extrabold font-mono text-slate-900 tabular-nums">
              {stats.totalOverdueInvoices}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Across active students
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Total Overdue Amount */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Total Overdue
            </span>
            <div className="p-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-extrabold font-mono text-rose-600 tabular-nums">
              {formatINR(stats.totalOverdueAmount)}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Pending collections
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. High-Priority Customers */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              High Priority
            </span>
            <div className="p-1.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <Flame className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-extrabold font-mono text-amber-600 tabular-nums">
              {stats.highPriorityCustomersCount}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Urgent &amp; High action
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Broken Promises */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Broken Promises
            </span>
            <div className="p-1.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-extrabold font-mono text-purple-700 tabular-nums">
              {stats.brokenPromisesCount}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Requires firm re-contact
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 5. Follow-ups Due Today */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Due Today
            </span>
            <div className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <CalendarCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-extrabold font-mono text-indigo-700 tabular-nums">
              {stats.followUpsDueTodayCount}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Promises &amp; callbacks
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 6. Amount Recovered This Month */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Recovered
            </span>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-extrabold font-mono text-emerald-600 tabular-nums">
              {formatINR(stats.amountRecoveredThisMonth)}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Collected this month
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
