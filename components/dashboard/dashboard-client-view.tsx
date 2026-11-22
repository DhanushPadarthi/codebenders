"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, Plus, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusinessOverviewBanner } from "@/components/dashboard/sample-data-banner";
import { FinancialSummaryCards } from "@/components/dashboard/financial-summary-cards";
import { CashflowForecastChart } from "@/components/dashboard/cashflow-forecast-chart";
import { SmartActionCenter } from "@/components/dashboard/smart-action-center";
import { RecentInvoicesTable } from "@/components/dashboard/recent-invoices-table";
import { UpcomingBillsCard } from "@/components/dashboard/upcoming-bills-card";
import { RecentPaymentsCard } from "@/components/dashboard/recent-payments-card";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { PaymentRecord } from "@/lib/dal/payments";
import type { BillRecord } from "@/lib/dal/bills";
import type { PaymentPromiseRecord, FollowUpTaskRecord } from "@/lib/dal/recovery";

export interface DashboardInitialData {
  customers: CustomerRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  bills: BillRecord[];
  promises: PaymentPromiseRecord[];
  followUps: FollowUpTaskRecord[];
  openingCashBalance: number;
  safeReserveThreshold: number;
}

export interface DashboardClientViewProps {
  business: {
    id: string;
    name: string;
  };
  initialData: DashboardInitialData;
}

export function DashboardClientView({ business, initialData }: DashboardClientViewProps) {
  const {
    customers,
    invoices,
    payments,
    bills,
    promises,
    followUps,
    openingCashBalance,
    safeReserveThreshold,
  } = initialData;

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthPrefix = useMemo(() => new Date().toISOString().slice(0, 7), []);

  // Compute live metrics strictly from real PostgreSQL records
  const metrics = useMemo(() => {
    // 1. Total outstanding amount
    const nonDraftInvoices = invoices.filter(
      (inv) => inv.status !== "draft" && inv.status !== "cancelled"
    );
    const totalOutstandingPaise = nonDraftInvoices.reduce(
      (sum, inv) => sum + Math.round((inv.balanceDue ?? 0) * 100),
      0
    );
    const totalOutstanding = totalOutstandingPaise / 100;
    const pendingCount = nonDraftInvoices.filter((inv) => (inv.balanceDue ?? 0) > 0).length;

    // 2. Overdue invoices
    const overdueInvoices = invoices.filter((inv) => {
      const isOverdue =
        inv.effectiveStatus === "overdue" ||
        inv.status === "overdue" ||
        (inv.dueDate < todayStr && inv.status !== "draft" && inv.status !== "cancelled" && inv.status !== "paid");
      return isOverdue && (inv.balanceDue ?? 0) > 0;
    });
    const totalOverduePaise = overdueInvoices.reduce(
      (sum, inv) => sum + Math.round((inv.balanceDue ?? 0) * 100),
      0
    );
    const totalOverdue = totalOverduePaise / 100;
    const overdueCount = overdueInvoices.length;

    // 3. Collected this month
    const thisMonthPayments = payments.filter(
      (p) => p.paymentDate && p.paymentDate.startsWith(currentMonthPrefix)
    );
    const monthlyCollectedPaise = thisMonthPayments.reduce(
      (sum, p) => sum + (p.amountPaise ?? Math.round((Number(p.amount) || 0) * 100)),
      0
    );
    const monthlyCollected = monthlyCollectedPaise / 100;
    const paymentCount = thisMonthPayments.length;

    // 4. Active students
    const activeStudentsCount = customers.filter((c) => c.status === "active").length;
    const totalStudentsCount = customers.length;

    // 5. Pending expenses (unpaid bills)
    const unpaidBills = bills.filter((b) => b.status !== "paid");
    const pendingExpensesPaise = unpaidBills.reduce(
      (sum, b) => sum + (b.amountPaise ?? Math.round((Number(b.amount) || 0) * 100)),
      0
    );
    const pendingExpenses = pendingExpensesPaise / 100;
    const unpaidBillsCount = unpaidBills.length;

    return {
      totalOutstanding,
      pendingCount,
      totalOverdue,
      overdueCount,
      monthlyCollected,
      paymentCount,
      activeStudentsCount,
      totalStudentsCount,
      pendingExpenses,
      unpaidBillsCount,
    };
  }, [invoices, payments, customers, bills, todayStr, currentMonthPrefix]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Welcome & Quick Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Cashflow Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time receivables, tuition fee collections, and 30-day runway health.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/recovery-queue">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Smart Recovery Queue</span>
            </Button>
          </Link>
          <Link href="/payments">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
              <span>Record Payment</span>
            </Button>
          </Link>
          <Link href="/invoices/new">
            <Button
              variant="default"
              size="sm"
              className="text-xs gap-1.5 bg-slate-900 text-white shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Invoice</span>
            </Button>
          </Link>
          <Link href="/invoices">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Authenticated Business Banner (Zero mock Sharma Academy) */}
      <BusinessOverviewBanner businessName={business.name} />

      {/* Financial Summary KPI Cards (5 Real Cards) */}
      <section aria-label="Financial Summary">
        <FinancialSummaryCards
          totalOutstanding={metrics.totalOutstanding}
          pendingCount={metrics.pendingCount}
          totalOverdue={metrics.totalOverdue}
          overdueCount={metrics.overdueCount}
          monthlyCollected={metrics.monthlyCollected}
          paymentCount={metrics.paymentCount}
          activeStudentsCount={metrics.activeStudentsCount}
          totalStudentsCount={metrics.totalStudentsCount}
          pendingExpenses={metrics.pendingExpenses}
          unpaidBillsCount={metrics.unpaidBillsCount}
        />
      </section>

      {/* Smart Action Centre (Urgent follow-ups, promises, and bills) */}
      <section aria-label="Smart Action Centre">
        <SmartActionCenter
          customers={customers}
          invoices={invoices}
          promises={promises}
          followUps={followUps}
          bills={bills}
        />
      </section>

      {/* Interactive Cashflow Forecast (Recharts 30-Day Roll-Forward) */}
      <section aria-label="Cashflow Forecast">
        <CashflowForecastChart
          invoices={invoices}
          bills={bills}
          customers={customers}
          promises={promises}
          openingCashBalance={openingCashBalance}
          safeReserveThreshold={safeReserveThreshold}
        />
      </section>

      {/* Recent Invoices Table (With Status Filters) */}
      <section aria-label="Recent Invoices">
        <RecentInvoicesTable invoices={invoices} />
      </section>

      {/* Compact Secondary Grid: Upcoming Bills & Recent Payment Activity */}
      <section
        aria-label="Bills and Payments Activity"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <UpcomingBillsCard bills={bills} />
        <RecentPaymentsCard payments={payments} />
      </section>
    </div>
  );
}
