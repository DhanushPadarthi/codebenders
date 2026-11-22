"use client";

import React from "react";
import {
  Clock,
  AlertTriangle,
  TrendingUp,
  Receipt,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useFeePulse } from "@/lib/invoice-context";

const iconMap: Record<string, LucideIcon> = {
  Clock,
  AlertTriangle,
  TrendingUp,
  Receipt,
  Users,
};

export interface FinancialSummaryCardsProps {
  totalOutstanding?: number;
  pendingCount?: number;
  totalOverdue?: number;
  overdueCount?: number;
  monthlyCollected?: number;
  paymentCount?: number;
  activeStudentsCount?: number;
  totalStudentsCount?: number;
  pendingExpenses?: number;
  unpaidBillsCount?: number;
}

export function FinancialSummaryCards(props: FinancialSummaryCardsProps) {
  const context = useFeePulse();

  // If props are passed, use them; otherwise fallback to context
  const hasProps =
    props.totalOutstanding !== undefined ||
    props.monthlyCollected !== undefined ||
    props.activeStudentsCount !== undefined;

  const totalOutstanding = hasProps
    ? props.totalOutstanding ?? 0
    : context.invoices
        .filter((inv) => inv.status !== "draft" && inv.status !== "cancelled")
        .reduce((sum, inv) => sum + (inv.balanceDue ?? 0), 0);

  const pendingCount = hasProps
    ? props.pendingCount ?? 0
    : context.invoices.filter(
        (inv) => inv.status !== "draft" && inv.status !== "cancelled" && (inv.balanceDue ?? 0) > 0
      ).length;

  const totalOverdue = hasProps
    ? props.totalOverdue ?? 0
    : context.invoices
        .filter((inv) => inv.status === "overdue" && (inv.balanceDue ?? 0) > 0)
        .reduce((sum, inv) => sum + (inv.balanceDue ?? 0), 0);

  const overdueCount = hasProps
    ? props.overdueCount ?? 0
    : context.invoices.filter(
        (inv) => inv.status === "overdue" && (inv.balanceDue ?? 0) > 0
      ).length;

  const monthlyCollected = hasProps
    ? props.monthlyCollected ?? 0
    : context.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const paymentCount = hasProps
    ? props.paymentCount ?? 0
    : context.payments.length;

  const activeStudentsCount = hasProps
    ? props.activeStudentsCount ?? 0
    : context.customers.filter((c) => c.status === "active").length;

  const totalStudentsCount = hasProps
    ? props.totalStudentsCount ?? activeStudentsCount
    : context.customers.length;

  const pendingExpenses = hasProps
    ? props.pendingExpenses ?? 0
    : 0;

  const unpaidBillsCount = hasProps
    ? props.unpaidBillsCount ?? 0
    : 0;

  const dynamicMetrics = [
    {
      title: "Total Outstanding",
      amount: totalOutstanding,
      isCurrency: true,
      subtitle: `Across ${pendingCount} invoices pending payment`,
      trendText: `${pendingCount} invoice(s) pending settlement`,
      trendType: totalOutstanding > 0 ? ("warning" as const) : ("positive" as const),
      iconName: "Clock",
    },
    {
      title: "Overdue Amount",
      amount: totalOverdue,
      isCurrency: true,
      subtitle:
        totalOutstanding > 0
          ? `${Math.round((totalOverdue / totalOutstanding) * 100)}% of total receivables`
          : "0% of total receivables",
      trendText: `${overdueCount} student(s) past payment due date`,
      trendType: totalOverdue > 0 ? ("danger" as const) : ("positive" as const),
      iconName: "AlertTriangle",
    },
    {
      title: "Collected This Month",
      amount: monthlyCollected,
      isCurrency: true,
      subtitle: `${paymentCount} verified fee receipt(s)`,
      trendText: `↑ ${paymentCount} recorded payment(s)`,
      trendType: "positive" as const,
      iconName: "TrendingUp",
    },
    {
      title: "Pending Overheads",
      amount: pendingExpenses,
      isCurrency: true,
      subtitle: `Across ${unpaidBillsCount} unpaid operational bills`,
      trendText: `${unpaidBillsCount} bill(s) pending settlement`,
      trendType: pendingExpenses > 0 ? ("warning" as const) : ("positive" as const),
      iconName: "Receipt",
    },
    {
      title: "Active Students",
      amount: activeStudentsCount,
      isCurrency: false,
      subtitle: `Out of ${totalStudentsCount} enrolled student(s)`,
      trendText: `${activeStudentsCount} active tuition profiles`,
      trendType: "positive" as const,
      iconName: "Users",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {dynamicMetrics.map((metric, idx) => {
        const Icon = iconMap[metric.iconName] || Clock;
        const isDanger = metric.trendType === "danger";
        const isPositive = metric.trendType === "positive";
        const isWarning = metric.trendType === "warning";

        return (
          <Card
            key={idx}
            className="hover:shadow-md transition-shadow duration-200 border-slate-200/90 relative overflow-hidden"
          >
            {/* Top decorative micro-accent line */}
            <div
              className={cn(
                "absolute top-0 inset-x-0 h-1",
                isPositive && "bg-emerald-500",
                isDanger && "bg-rose-500",
                isWarning && "bg-amber-500",
                !isPositive && !isDanger && !isWarning && "bg-indigo-500"
              )}
            />

            <CardContent className="p-4 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                  {metric.title}
                </span>
                <div
                  className={cn(
                    "p-1.5 rounded-lg border shrink-0",
                    isPositive && "bg-emerald-50 text-emerald-600 border-emerald-100",
                    isDanger && "bg-rose-50 text-rose-600 border-rose-100",
                    isWarning && "bg-amber-50 text-amber-600 border-amber-100",
                    !isPositive && !isDanger && !isWarning && "bg-slate-50 text-slate-600 border-slate-100"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 stroke-[2.2]" />
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="text-xl font-bold tracking-tight text-slate-900 font-mono">
                  {metric.isCurrency ? formatINR(metric.amount) : metric.amount}
                </div>
                <p className="text-[11px] text-slate-500 leading-tight truncate">
                  {metric.subtitle}
                </p>
              </div>

              {metric.trendText && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[10px] font-medium truncate">
                  {isPositive && (
                    <ArrowUpRight className="w-3 h-3 text-emerald-600 shrink-0" />
                  )}
                  {isDanger && (
                    <ArrowDownRight className="w-3 h-3 text-rose-600 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "truncate",
                      isPositive && "text-emerald-700",
                      isDanger && "text-rose-700",
                      isWarning && "text-amber-700",
                      !isPositive && !isDanger && !isWarning && "text-slate-600"
                    )}
                  >
                    {metric.trendText}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
