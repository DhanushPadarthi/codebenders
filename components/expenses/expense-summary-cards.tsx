"use client";

import React, { useMemo } from "react";
import {
  TrendingDown,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import type { ExpenseSummaryMetrics, BillRecord } from "@/lib/dal/bills";

interface ExpenseSummaryCardsProps {
  metrics?: ExpenseSummaryMetrics;
  bills?: BillRecord[];
  asOfDate?: string;
}

export function ExpenseSummaryCards({ metrics, bills = [], asOfDate }: ExpenseSummaryCardsProps) {
  const computedMetrics: ExpenseSummaryMetrics = useMemo(() => {
    if (metrics) return metrics;

    const currentDate = asOfDate || new Date().toISOString().slice(0, 10);
    const currentMonthPrefix = currentDate.slice(0, 7);

    let paidThisMonthPaise = 0;
    let totalPaidAllTimePaise = 0;
    let upcomingExpensesPaise = 0;
    let overdueExpensesPaise = 0;
    let recurringMonthlyProjectionPaise = 0;

    let upcomingCount = 0;
    let overdueCount = 0;
    let paidCount = 0;

    const categoryBreakdownPaise: Record<string, number> = {};

    bills.forEach((b) => {
      const amountPaise = b.amountPaise || Math.round(Number(b.amount) * 100);

      categoryBreakdownPaise[b.uiCategory] =
        (categoryBreakdownPaise[b.uiCategory] || 0) + amountPaise;

      if (b.status === "paid") {
        totalPaidAllTimePaise += amountPaise;
        paidCount += 1;
        const isPaidThisMonth =
          (b.paidDate && b.paidDate.startsWith(currentMonthPrefix)) ||
          (!b.paidDate && b.dueDate.startsWith(currentMonthPrefix));
        if (isPaidThisMonth) {
          paidThisMonthPaise += amountPaise;
        }
      } else {
        const isOverdue = b.status === "overdue" || b.dueDate < currentDate;
        if (isOverdue) {
          overdueExpensesPaise += amountPaise;
          overdueCount += 1;
        } else {
          upcomingExpensesPaise += amountPaise;
          upcomingCount += 1;
        }
      }

      if (b.isRecurring) {
        if (b.recurringFrequency === "monthly" || !b.recurringFrequency) {
          recurringMonthlyProjectionPaise += amountPaise;
        } else if (b.recurringFrequency === "quarterly") {
          recurringMonthlyProjectionPaise += Math.round(amountPaise / 3);
        } else if (b.recurringFrequency === "yearly") {
          recurringMonthlyProjectionPaise += Math.round(amountPaise / 12);
        }
      }
    });

    let unpaidThisMonthPaise = 0;
    bills.forEach((b) => {
      if (b.status !== "paid" && b.dueDate.startsWith(currentMonthPrefix)) {
        unpaidThisMonthPaise += b.amountPaise || Math.round(Number(b.amount) * 100);
      }
    });

    const totalThisMonthPaise = paidThisMonthPaise + unpaidThisMonthPaise;

    const categoryBreakdown: Record<string, number> = {};
    for (const [cat, p] of Object.entries(categoryBreakdownPaise)) {
      categoryBreakdown[cat] = p / 100;
    }

    return {
      totalThisMonth: totalThisMonthPaise / 100,
      totalThisMonthPaise,
      upcomingExpenses: upcomingExpensesPaise / 100,
      upcomingExpensesPaise,
      overdueExpenses: overdueExpensesPaise / 100,
      overdueExpensesPaise,
      paidThisMonth: paidThisMonthPaise / 100,
      paidThisMonthPaise,
      totalPaidAllTime: totalPaidAllTimePaise / 100,
      totalPaidAllTimePaise,
      recurringMonthlyProjection: recurringMonthlyProjectionPaise / 100,
      recurringMonthlyProjectionPaise,
      upcomingCount,
      overdueCount,
      paidCount,
      categoryBreakdown,
    };
  }, [metrics, bills, asOfDate]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Expenses This Month */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-slate-900" />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Expenses This Month
            </span>
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
              <TrendingDown className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatINR(computedMetrics.totalThisMonth)}
            </div>
            <p className="text-xs text-slate-500">
              Paid + scheduled for this calendar month
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-slate-600">
            <span>Run-rate: {formatINR(computedMetrics.recurringMonthlyProjection)}/mo</span>
            <span className="text-emerald-700 font-semibold">{formatINR(computedMetrics.paidThisMonth)} paid</span>
          </div>
        </CardContent>
      </Card>

      {/* 2. Upcoming Expenses */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-indigo-500" />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Upcoming Bills
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Calendar className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatINR(computedMetrics.upcomingExpenses)}
            </div>
            <p className="text-xs text-slate-500">
              {computedMetrics.upcomingCount} overhead(s) due soon
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-medium text-indigo-700">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
            <span>Scheduled & pending settlement</span>
          </div>
        </CardContent>
      </Card>

      {/* 3. Overdue Expenses */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div
          className={`absolute top-0 inset-x-0 h-1 ${
            computedMetrics.overdueExpenses > 0 ? "bg-rose-500" : "bg-emerald-500"
          }`}
        />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Overdue Expenses
            </span>
            <div
              className={`p-2 rounded-lg border ${
                computedMetrics.overdueExpenses > 0
                  ? "bg-rose-50 text-rose-600 border-rose-100"
                  : "bg-emerald-50 text-emerald-600 border-emerald-100"
              }`}
            >
              <AlertCircle className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div
              className={`text-2xl font-bold tracking-tight font-mono ${
                computedMetrics.overdueExpenses > 0 ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {formatINR(computedMetrics.overdueExpenses)}
            </div>
            <p className="text-xs text-slate-500">
              {computedMetrics.overdueCount > 0
                ? `${computedMetrics.overdueCount} bill(s) past payment deadline`
                : "All operating bills current"}
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium">
            <span
              className={
                computedMetrics.overdueExpenses > 0 ? "text-rose-600 font-semibold" : "text-emerald-700"
              }
            >
              {computedMetrics.overdueExpenses > 0 ? "Settle to avoid service cutoff" : "No overdue liabilities"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 4. Total Paid All Time */}
      <Card className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-emerald-500" />
        <CardContent className="p-5 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Settled (All-Time)
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
              {formatINR(computedMetrics.totalPaidAllTime)}
            </div>
            <p className="text-xs text-slate-500">
              {computedMetrics.paidCount} total operational payment(s)
            </p>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <RefreshCw className="w-3 h-3 text-emerald-600" />
            <span>Audited & reconciled records</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
