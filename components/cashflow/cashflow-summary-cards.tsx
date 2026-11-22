"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import { CashflowSummary } from "@/lib/finance/cashflow-engine";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

interface CashflowSummaryCardsProps {
  summary: CashflowSummary;
  timeframeLabel: string;
}

export function CashflowSummaryCards({ summary, timeframeLabel }: CashflowSummaryCardsProps) {
  const isClosingHealthy = summary.projectedClosingBalance >= summary.safeReserveThreshold;
  const isLowestHealthy = summary.lowestProjectedBalance >= summary.safeReserveThreshold;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Opening Cash Balance */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Opening Cash Balance
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Wallet className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums">
              {formatINR(summary.openingBalance)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Verified starting cash reserve
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Expected Inflows */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {timeframeLabel} Expected Inflows
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <ArrowDownLeft className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold font-mono text-emerald-600 tabular-nums">
              +{formatINR(summary.totalInflows)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Tuition receivables, promises &amp; cycles
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Expected Outflows */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {timeframeLabel} Scheduled Outflows
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <ArrowUpRight className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-extrabold font-mono text-rose-600 tabular-nums">
              -{formatINR(summary.totalOutflows)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Fixed rent, salaries, utilities &amp; bills
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Projected Closing Balance */}
      <Card className={`border shadow-2xs hover:shadow-md transition-shadow ${
        summary.hasDeficit
          ? "border-rose-300 bg-rose-50/30"
          : !isClosingHealthy
          ? "border-amber-300 bg-amber-50/30"
          : "border-slate-200/90 bg-white"
      }`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Projected Closing Balance
            </span>
            <div className={`p-2 rounded-xl border ${
              summary.hasDeficit
                ? "bg-rose-100 text-rose-700 border-rose-200"
                : !isClosingHealthy
                ? "bg-amber-100 text-amber-700 border-amber-200"
                : "bg-indigo-50 text-indigo-600 border-indigo-100"
            }`}>
              <TrendingUp className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className={`text-2xl font-extrabold font-mono tabular-nums ${
              summary.hasDeficit
                ? "text-rose-600"
                : !isClosingHealthy
                ? "text-amber-600"
                : "text-indigo-700"
            }`}>
              {formatINR(summary.projectedClosingBalance)}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {isLowestHealthy ? (
                <span className="inline-flex items-center text-emerald-700 tabular-nums">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Buffer safe (Min {formatINR(summary.lowestProjectedBalance)})
                </span>
              ) : summary.hasDeficit ? (
                <span className="inline-flex items-center text-rose-600 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  Deficit risk on {summary.firstDeficitDate}
                </span>
              ) : (
                <span className="inline-flex items-center text-amber-700 tabular-nums">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  Dips to {formatINR(summary.lowestProjectedBalance)}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
