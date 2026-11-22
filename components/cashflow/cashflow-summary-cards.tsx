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
      <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-all bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Opening Cash Balance
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-slate-900">
              {formatINR(summary.openingBalance)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Verified starting cash reserve
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Expected Inflows */}
      <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-all bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {timeframeLabel} Expected Inflows
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-emerald-600">
              +{formatINR(summary.totalInflows)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Tuition receivables, promises & cycles
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Expected Outflows */}
      <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-all bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {timeframeLabel} Scheduled Outflows
            </span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-rose-600">
              -{formatINR(summary.totalOutflows)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Fixed rent, salaries, utilities & bills
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Projected Closing Balance */}
      <Card className={`border shadow-xs transition-all ${
        summary.hasDeficit
          ? "border-rose-300 bg-rose-50/20"
          : !isClosingHealthy
          ? "border-amber-300 bg-amber-50/20"
          : "border-slate-200 bg-white"
      }`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Projected Closing Balance
            </span>
            <div className={`p-2 rounded-lg ${
              summary.hasDeficit
                ? "bg-rose-100 text-rose-700"
                : !isClosingHealthy
                ? "bg-amber-100 text-amber-700"
                : "bg-indigo-50 text-indigo-600"
            }`}>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold font-mono ${
              summary.hasDeficit
                ? "text-rose-600"
                : !isClosingHealthy
                ? "text-amber-600"
                : "text-indigo-700"
            }`}>
              {formatINR(summary.projectedClosingBalance)}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              {isLowestHealthy ? (
                <span className="inline-flex items-center text-emerald-600 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Buffer safe (Min {formatINR(summary.lowestProjectedBalance)})
                </span>
              ) : summary.hasDeficit ? (
                <span className="inline-flex items-center text-rose-600 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                  Deficit risk on {summary.firstDeficitDate}
                </span>
              ) : (
                <span className="inline-flex items-center text-amber-600 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />
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
