"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentsSummaryCards } from "@/components/payments/payments-summary-cards";
import { PaymentDirectoryTable } from "@/components/payments/payment-directory-table";
import { RecordPaymentDrawer } from "@/components/payments/record-payment-drawer";
import { PrintablePaymentReceipt } from "@/components/payments/printable-payment-receipt";
import type { PaymentRecord, PaymentSummaryMetrics, RecordPaymentResult } from "@/lib/dal/payments";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { CustomerRecord } from "@/lib/dal/customers";

interface PaymentsClientViewProps {
  initialPayments: PaymentRecord[];
  metrics?: PaymentSummaryMetrics;
  invoices?: InvoiceRecord[];
  customers?: CustomerRecord[];
  businessName?: string;
}

export function PaymentsClientView({
  initialPayments,
  metrics,
  invoices = [],
  customers = [],
  businessName = "FeePulse Academy",
}: PaymentsClientViewProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>(initialPayments);
  const [isRecordDrawerOpen, setIsRecordDrawerOpen] = useState(false);
  const [selectedReceiptPayment, setSelectedReceiptPayment] = useState<PaymentRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handlePaymentSuccess = (payment: PaymentRecord, result: RecordPaymentResult) => {
    setPayments((prev) => [payment, ...prev.filter((p) => p.id !== payment.id)]);
    showToast(
      `Recorded payment of ₹${payment.amount.toLocaleString("en-IN")} for ${payment.customerName} (${payment.receiptNumber}). Remaining Due: ₹${result.balanceDue.toLocaleString("en-IN")}`
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
              </Button>
            </Link>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">Payments & Collections</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            Payments & Fee Collections
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track tuition fee settlements, record UPI/cash receipts, and verify student ledger balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsRecordDrawerOpen(true)}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Record Payment</span>
          </Button>
        </div>
      </div>

      {/* Feedback Toast */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between shadow-2xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <PaymentsSummaryCards metrics={metrics} payments={payments} />

      {/* Payment Directory Table */}
      <PaymentDirectoryTable
        payments={payments}
        onViewReceipt={(p) => setSelectedReceiptPayment(p)}
        onRecordPaymentClick={() => setIsRecordDrawerOpen(true)}
      />

      {/* Record Payment Drawer */}
      <RecordPaymentDrawer
        isOpen={isRecordDrawerOpen}
        onClose={() => setIsRecordDrawerOpen(false)}
        customers={customers}
        invoices={invoices}
        onPaymentSuccess={handlePaymentSuccess}
        onViewReceipt={(p) => {
          setIsRecordDrawerOpen(false);
          setSelectedReceiptPayment(p);
        }}
      />

      {/* Printable Receipt Modal */}
      {selectedReceiptPayment && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/80 p-4 sm:p-6 animate-in fade-in duration-150">
          <div className="max-w-2xl mx-auto my-6">
            <PrintablePaymentReceipt
              payment={selectedReceiptPayment}
              businessName={businessName}
              onBack={() => setSelectedReceiptPayment(null)}
              showBackAction
            />
          </div>
        </div>
      )}
    </div>
  );
}
