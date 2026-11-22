import React from "react";
import { FileText, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import type { InvoiceRecord } from "@/lib/dal/invoices";

interface InvoiceSummaryCardsProps {
  invoices: InvoiceRecord[];
}

export function InvoiceSummaryCards({ invoices }: InvoiceSummaryCardsProps) {
  // Use integer paise arithmetic to avoid floating-point rounding errors
  let totalInvoicedPaise = 0;
  let totalCollectedPaise = 0;
  let totalOutstandingPaise = 0;
  let overdueAmountPaise = 0;
  let overdueCount = 0;

  const today = new Date().toISOString().slice(0, 10);

  for (const inv of invoices) {
    if (inv.deletedAt) continue;

    const totalPaise = Math.round((inv.totalAmount || 0) * 100);
    const paidPaise = Math.round((inv.amountPaid || 0) * 100);
    const balancePaise = Math.round((inv.balanceDue || 0) * 100);

    totalInvoicedPaise += totalPaise;
    totalCollectedPaise += paidPaise;

    if (inv.status !== "draft") {
      totalOutstandingPaise += balancePaise;
    }

    const isOverdue =
      inv.status === "overdue" ||
      inv.effectiveStatus === "overdue" ||
      (inv.dueDate < today && balancePaise > 0 && inv.status !== "draft");

    if (isOverdue && balancePaise > 0) {
      overdueCount++;
      overdueAmountPaise += balancePaise;
    }
  }

  const totalInvoiced = totalInvoicedPaise / 100;
  const totalCollected = totalCollectedPaise / 100;
  const totalOutstanding = totalOutstandingPaise / 100;
  const overdueAmount = overdueAmountPaise / 100;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Invoiced */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Total Invoiced
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <FileText className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-slate-900 font-mono tabular-nums">
            {formatINR(totalInvoiced)}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Across {invoices.length} billing records
          </p>
        </CardContent>
      </Card>

      {/* Total Collected */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Fees Collected
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-emerald-700 font-mono tabular-nums">
            {formatINR(totalCollected)}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {totalInvoiced > 0
              ? `${((totalCollected / totalInvoiced) * 100).toFixed(1)}% recovery rate`
              : "0% collected"}
          </p>
        </CardContent>
      </Card>

      {/* Outstanding Balance */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Balance Due
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <Clock className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-slate-900 font-mono tabular-nums">
            {formatINR(totalOutstanding)}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {totalOutstanding > 0 ? "Pending fee settlements" : "All dues settled"}
          </p>
        </CardContent>
      </Card>

      {/* Overdue Amount */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Overdue Fees
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <AlertTriangle className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-rose-600 font-mono tabular-nums">
            {formatINR(overdueAmount)}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {overdueCount > 0
              ? `Across ${overdueCount} overdue ${overdueCount === 1 ? "invoice" : "invoices"}`
              : "No overdue receivables"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
