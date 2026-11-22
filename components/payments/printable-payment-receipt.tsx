"use client";

import React from "react";
import { Printer, ArrowLeft, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import type { PaymentRecord } from "@/lib/dal/payments";

interface PrintablePaymentReceiptProps {
  payment: PaymentRecord;
  businessName?: string;
  remainingBalance?: number;
  onBack?: () => void;
  showBackAction?: boolean;
}

export function PrintablePaymentReceipt({
  payment,
  businessName = "FeePulse Academy",
  remainingBalance,
  onBack,
  showBackAction = false,
}: PrintablePaymentReceiptProps) {
  const handlePrint = () => {
    window.print();
  };

  const paymentDateFormatted = payment.paymentDate
    ? formatDate(payment.paymentDate)
    : formatDate(new Date().toISOString().slice(0, 10));

  const formatMode = (mode: string) => {
    switch (mode) {
      case "upi":
        return "UPI";
      case "cash":
        return "Cash";
      case "bank_transfer":
        return "Bank Transfer / NEFT";
      case "cheque":
        return "Cheque";
      case "other":
      default:
        return "Other";
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action bar (hidden during print) */}
      <div className="print:hidden flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          {showBackAction && onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Payments
            </Button>
          )}
          <div>
            <span className="font-bold text-sm block">Fee Payment Receipt</span>
            <span className="text-xs text-slate-400">
              Official acknowledgement slip formatted for print & PDF archiving
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handlePrint}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </Button>
        </div>
      </div>

      {/* The Printable Slip Document */}
      <div
        id="printable-payment-receipt"
        className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 sm:p-10 max-w-2xl mx-auto print:border-none print:shadow-none print:p-0 print:max-w-none text-slate-800"
      >
        {/* Receipt Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {businessName}
            </h1>
            <p className="text-xs text-slate-500">
              Tuition & Coaching Fee Settlement Receipt • Verified Record
            </p>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="inline-block px-3 py-1 rounded-lg bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider mb-1.5">
              Fee Payment Receipt
            </div>
            <div className="font-mono text-base font-extrabold text-slate-900">
              {payment.receiptNumber}
            </div>
            <div className="mt-1">
              <Badge variant="success" className="text-[10px]">
                STATUS: RECORDED
              </Badge>
            </div>
          </div>
        </div>

        {/* Receipt Metadata & Student Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-200 text-xs">
          {/* Student & Parent Info */}
          <div className="space-y-1.5">
            <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Received With Thanks From
            </span>
            <div className="text-sm font-bold text-slate-900">
              {payment.customerName}
            </div>
            <div className="text-slate-600 font-medium">
              Class / Batch: <span className="text-slate-900">{payment.customerGrade}</span>
            </div>
            {payment.parentName && (
              <div className="text-slate-600">
                Guardian: <span className="text-slate-900 font-medium">{payment.parentName}</span>
              </div>
            )}
            {payment.parentPhone && (
              <div className="text-slate-600">
                Phone: <span className="font-mono text-slate-900">{payment.parentPhone}</span>
              </div>
            )}
          </div>

          {/* Payment & Invoice Metadata */}
          <div className="space-y-1.5 sm:text-right">
            <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Receipt & Settlement Details
            </span>
            <div>
              <span className="text-slate-500">Payment Date: </span>
              <span className="font-semibold text-slate-900">{paymentDateFormatted}</span>
            </div>
            <div>
              <span className="text-slate-500">Against Invoice: </span>
              <span className="font-mono font-bold text-indigo-700">{payment.invoiceNumber}</span>
            </div>
            <div>
              <span className="text-slate-500">Payment Method: </span>
              <span className="font-semibold text-slate-900">{formatMode(payment.paymentMode)}</span>
            </div>
            {payment.referenceId && payment.referenceId !== "—" && (
              <div>
                <span className="text-slate-500">Reference / UTR: </span>
                <span className="font-mono font-medium text-slate-700">{payment.referenceId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Financial Breakdown Table */}
        <div className="py-6 border-b border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-2">Description</th>
                <th className="py-2.5 px-3 text-right">Settlement Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-3.5 px-2">
                  <div className="font-bold text-slate-900 text-sm">
                    Fee Payment for {payment.customerName}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Settlement for invoice {payment.invoiceNumber} • Paid via {formatMode(payment.paymentMode)}
                    {payment.referenceId && payment.referenceId !== "—" ? ` (${payment.referenceId})` : ""}
                  </div>
                </td>
                <td className="py-3.5 px-3 text-right font-mono font-extrabold text-base text-emerald-700">
                  {formatINR(payment.amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Balance Computation Breakdown */}
        <div className="flex flex-col sm:flex-row justify-between items-start pt-6 gap-6">
          {/* Official Verification Notice (Left) */}
          <div className="max-w-xs space-y-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px]">
              Payment Verification Notice
            </span>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-[10.5px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Audited Ledger Acknowledgement</span>
              </div>
              <p className="text-slate-500 text-[10px] leading-relaxed">
                This document acknowledges payment received and manually recorded in the FeePulse academy ledger. Transaction references are recorded for audit compliance.
              </p>
            </div>
          </div>

          {/* Balance Breakdown (Right) */}
          <div className="w-full sm:w-64 space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-200 text-emerald-800 font-bold">
              <span>Amount Received (This Slip):</span>
              <span className="font-mono text-emerald-700 text-sm">
                +{formatINR(payment.amount)}
              </span>
            </div>

            {remainingBalance !== undefined && (
              <>
                <div className="flex justify-between py-2 border-t-2 border-slate-900 text-sm font-extrabold text-slate-900">
                  <span>Remaining Invoice Balance:</span>
                  <span
                    className={`font-mono ${
                      remainingBalance > 0 ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {formatINR(remainingBalance)}
                  </span>
                </div>

                {remainingBalance === 0 && (
                  <div className="flex items-center justify-end gap-1 text-[11px] text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Invoice Fully Cleared</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Remarks and Signature Footer */}
        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="space-y-1 text-center sm:text-left">
            <span className="font-semibold text-slate-700 block">Remarks / Notes:</span>
            <p className="text-[11px] text-slate-500 italic">
              {payment.notes || "Official tuition fee acknowledgement. Thank you for your timely settlement."}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Generated via FeePulse • AI Cashflow Copilot</span>
            </div>
          </div>

          <div className="text-center sm:text-right shrink-0">
            <div className="h-12 w-36 border-b border-dashed border-slate-300 mx-auto sm:ml-auto" />
            <span className="text-[11px] font-semibold text-slate-700 block mt-1">
              Authorized Signature & Seal
            </span>
            <span className="text-[10px] text-slate-400">{businessName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
