"use client";

import React from "react";
import Link from "next/link";
import { CreditCard, ArrowUpRight, CheckCircle2, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR, formatDate } from "@/lib/formatters";
import { useFeePulse } from "@/lib/invoice-context";
import type { PaymentRecord } from "@/lib/dal/payments";

interface PaymentDisplayItem {
  id: string;
  amount: number | string;
  amountPaise?: number;
  paymentMode?: string;
  paymentDate?: string;
  paidAt?: string;
  customerName?: string;
  studentName?: string;
  customerGrade?: string;
  invoiceNumber?: string;
}

export interface RecentPaymentsCardProps {
  payments?: PaymentRecord[];
}

export function RecentPaymentsCard(props: RecentPaymentsCardProps) {
  const fallbackContext = useFeePulse();

  const rawPayments: PaymentDisplayItem[] =
    props.payments !== undefined
      ? props.payments
      : (fallbackContext.payments as unknown as PaymentDisplayItem[]);

  // Current calendar month prefix (e.g. "2026-11")
  const currentMonthPrefix = new Date().toISOString().slice(0, 7);

  const monthlyTotal = rawPayments
    .filter((p) => {
      if (p.paymentDate && p.paymentDate.startsWith(currentMonthPrefix)) return true;
      if (p.paidAt && p.paidAt.toLowerCase().includes(currentMonthPrefix)) return true;
      return false;
    })
    .reduce((sum, p) => sum + (p.amountPaise ? p.amountPaise / 100 : Number(p.amount) || 0), 0);

  const displayPayments = rawPayments.slice(0, 5);

  return (
    <Card className="border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CreditCard className="w-4 h-4" />
            </div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Recent Payment Activity
            </CardTitle>
          </div>
          <Badge variant="success" className="text-[10px]">
            {rawPayments.length} Recorded
          </Badge>
        </CardHeader>

        <CardContent className="p-5 pt-0 space-y-3">
          {displayPayments.length === 0 ? (
            <div className="text-center py-8 px-4 space-y-2">
              <CreditCard className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No payment receipts yet</p>
              <p className="text-xs text-slate-500">
                Payments recorded against fee invoices will appear here.
              </p>
              <Link href="/payments">
                <Button variant="outline" size="sm" className="text-xs mt-1 gap-1">
                  <Plus className="w-3 h-3" />
                  <span>Record Payment</span>
                </Button>
              </Link>
            </div>
          ) : (
            displayPayments.map((payment) => {
              const studentName =
                payment.customerName || payment.studentName || "Student";
              const gradeBatch = payment.customerGrade || "General Batch";
              const invoiceNo = payment.invoiceNumber || "INV";
              const paymentMode = (payment.paymentMode || "UPI").toUpperCase();
              const dateDisplay = payment.paymentDate
                ? formatDate(payment.paymentDate, "short")
                : payment.paidAt || "Recent";

              return (
                <div
                  key={payment.id}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{studentName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {gradeBatch} •{" "}
                      <span className="font-mono text-slate-600 font-medium">
                        {invoiceNo}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-emerald-600">
                      +{formatINR(Number(payment.amount))}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                      <span className="px-1.5 py-0.2 rounded bg-slate-200/60 text-slate-700 font-medium">
                        {paymentMode}
                      </span>
                      <span>{dateDisplay}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </div>

      <div className="p-3 bg-slate-50/70 border-t border-slate-100 text-xs flex items-center justify-between">
        <span className="text-slate-500">
          This Month: <strong className="text-emerald-700 font-mono">{formatINR(monthlyTotal)}</strong>
        </span>
        <Link
          href="/payments"
          className="font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1"
        >
          All Payments <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Card>
  );
}
