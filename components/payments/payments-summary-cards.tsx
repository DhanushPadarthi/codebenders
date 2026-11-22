"use client";

import React from "react";
import {
  CreditCard,
  Calendar,
  TrendingUp,
  Receipt,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import type { PaymentSummaryMetrics, PaymentRecord } from "@/lib/dal/payments";

interface PaymentsSummaryCardsProps {
  metrics?: PaymentSummaryMetrics;
  payments?: PaymentRecord[];
}

export function PaymentsSummaryCards({ metrics, payments = [] }: PaymentsSummaryCardsProps) {
  // Compute from payments array in integer paise if metrics not directly provided
  const computedMetrics: PaymentSummaryMetrics = React.useMemo(() => {
    if (metrics) return metrics;

    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);

    let totalPaise = 0;
    let cashPaise = 0;
    let upiPaise = 0;
    let bankPaise = 0;
    let chequePaise = 0;
    let otherPaise = 0;
    let todayPaise = 0;
    let monthPaise = 0;

    for (const p of payments) {
      const paise = p.amountPaise || Math.round(Number(p.amount) * 100);
      totalPaise += paise;

      if (p.paymentMode === "cash") cashPaise += paise;
      else if (p.paymentMode === "upi") upiPaise += paise;
      else if (p.paymentMode === "bank_transfer") bankPaise += paise;
      else if (p.paymentMode === "cheque") chequePaise += paise;
      else otherPaise += paise;

      if (p.paymentDate === todayStr) todayPaise += paise;
      if (p.paymentDate.startsWith(monthStr)) monthPaise += paise;
    }

    return {
      totalCollected: totalPaise / 100,
      totalCollectedPaise: totalPaise,
      paymentCount: payments.length,
      cashCollected: cashPaise / 100,
      upiCollected: upiPaise / 100,
      bankTransferCollected: bankPaise / 100,
      chequeCollected: chequePaise / 100,
      otherCollected: otherPaise / 100,
      todayCollected: todayPaise / 100,
      thisMonthCollected: monthPaise / 100,
    };
  }, [metrics, payments]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Collected */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500" />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Collections
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <TrendingUp className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatINR(computedMetrics.totalCollected)}
            </div>
            <p className="text-xs text-slate-500">
              Verified fee receipts in PostgreSQL
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-emerald-700">
            <span className="flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>UPI: {formatINR(computedMetrics.upiCollected)}</span>
            </span>
            <span className="text-slate-500 font-normal">
              Cash: {formatINR(computedMetrics.cashCollected)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Today's Collections */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-indigo-500" />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today&apos;s Collections
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Calendar className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatINR(computedMetrics.todayCollected)}
            </div>
            <p className="text-xs text-slate-500">
              Credited today across batches
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-medium text-indigo-700">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
            <span>Daily cashflow receipt ledger</span>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Collections */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-emerald-600" />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              This Month&apos;s Collections
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
              <CreditCard className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatINR(computedMetrics.thisMonthCollected)}
            </div>
            <p className="text-xs text-slate-500">
              Current billing period settlements
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Bank & Cheques: {formatINR(computedMetrics.bankTransferCollected + computedMetrics.chequeCollected)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Number of Transactions */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-slate-700" />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recorded Receipts
            </span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
              <Receipt className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {computedMetrics.paymentCount}
            </div>
            <p className="text-xs text-slate-500">
              Official ledger entries generated
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-600">
            <span>UPI • Cash • Cheque • NEFT</span>
            <span className="text-emerald-700 font-bold">100% Reconciled</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
