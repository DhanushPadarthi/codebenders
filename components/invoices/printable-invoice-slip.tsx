"use client";

import React from "react";
import { Printer, ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import type { InvoiceRecord } from "@/lib/dal/invoices";

interface PrintableInvoiceSlipProps {
  invoice: InvoiceRecord;
  businessName?: string;
  businessPhone?: string;
  businessEmail?: string;
  onBack?: () => void;
  showBackAction?: boolean;
}

export function PrintableInvoiceSlip({
  invoice,
  businessName = "Tuition & Coaching Academy",
  businessPhone,
  businessEmail,
  onBack,
  showBackAction = false,
}: PrintableInvoiceSlipProps) {
  const handlePrint = () => {
    window.print();
  };

  const status = invoice.effectiveStatus || invoice.status;

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
              <ArrowLeft className="w-4 h-4" /> Back to Invoices
            </Button>
          )}
          <div>
            <span className="font-bold text-sm block">Fee Invoice Slip Preview</span>
            <span className="text-xs text-slate-400">
              Printable layout formatted for A4 tuition fee receipts & PDF export
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

      {/* Information Banner (hidden during print) */}
      <div className="print:hidden p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0 text-amber-600" />
        <span>
          <strong>Note:</strong> Generating or printing this fee slip does not transmit an email or WhatsApp message to the parent. Hand the physical copy or PDF to the parent directly.
        </span>
      </div>

      {/* The Printable Slip Document */}
      <div
        id="printable-fee-slip"
        className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 sm:p-10 max-w-3xl mx-auto print:border-none print:shadow-none print:p-0 print:max-w-none text-slate-800"
      >
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {businessName}
            </h1>
            <p className="text-xs text-slate-500">
              Personalized Tuition & Academic Excellence
            </p>
            {(businessPhone || businessEmail) && (
              <p className="text-xs text-slate-500">
                {businessPhone && `Contact: ${businessPhone}`}
                {businessPhone && businessEmail && ` • `}
                {businessEmail && `Email: ${businessEmail}`}
              </p>
            )}
          </div>

          <div className="text-left sm:text-right shrink-0">
            <div className="inline-block px-3 py-1 rounded-lg bg-slate-900 text-white font-bold text-xs uppercase tracking-wider mb-2">
              Tuition Fee Invoice
            </div>
            <div className="font-mono text-base font-extrabold text-slate-900">
              {invoice.invoiceNumber}
            </div>
            <div className="mt-1">
              <Badge
                variant={
                  status === "paid"
                    ? "success"
                    : status === "overdue"
                    ? "danger"
                    : status === "partially_paid"
                    ? "warning"
                    : "secondary"
                }
                className="text-[11px]"
              >
                Status: {status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Invoice Metadata & Student Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-slate-200 text-xs">
          {/* Bill To */}
          <div className="space-y-1.5">
            <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Billed To (Student & Parent)
            </span>
            <div className="text-sm font-bold text-slate-900">
              {invoice.customerName}
            </div>
            <div className="text-slate-600 font-medium">
              Class / Batch: {invoice.customerGrade}
            </div>
            <div className="text-slate-500">
              Parent: {invoice.parentName}
            </div>
            <div className="text-slate-500 font-mono">
              Mobile: {invoice.parentPhone}
            </div>
          </div>

          {/* Billing Dates */}
          <div className="space-y-2 sm:text-right">
            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block">
                Issue Date
              </span>
              <span className="font-medium text-slate-900">
                {formatDate(invoice.issueDate)}
              </span>
            </div>
            <div>
              <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block">
                Payment Due Date
              </span>
              <span
                className={`font-semibold ${
                  status === "overdue" ? "text-rose-600" : "text-slate-900"
                }`}
              >
                {formatDate(invoice.dueDate)}
              </span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="py-6 border-b border-slate-200">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                <th className="pb-3 text-left">Description</th>
                <th className="pb-3 text-center">Qty</th>
                <th className="pb-3 text-right">Unit Fee</th>
                <th className="pb-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="py-3 text-slate-900 font-medium">
                      {item.description}
                    </td>
                    <td className="py-3 text-center text-slate-600 font-mono">
                      {item.quantity}
                    </td>
                    <td className="py-3 text-right text-slate-600 font-mono">
                      {formatINR(item.unitPrice)}
                    </td>
                    <td className="py-3 text-right text-slate-900 font-mono font-semibold">
                      {formatINR(item.totalPrice)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 text-slate-900 font-medium">
                    {invoice.customerGrade} - Tuition Fee
                  </td>
                  <td className="py-3 text-center text-slate-600 font-mono">1</td>
                  <td className="py-3 text-right text-slate-600 font-mono">
                    {formatINR(invoice.subtotal)}
                  </td>
                  <td className="py-3 text-right text-slate-900 font-mono font-semibold">
                    {formatINR(invoice.subtotal)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Financial Summary & Balance Due */}
        <div className="py-6 flex flex-col sm:flex-row items-start justify-between gap-6 border-b border-slate-200 text-xs">
          {/* Notes & Payment Terms */}
          <div className="sm:max-w-md space-y-2">
            <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] block">
              Tuition Notes & Terms
            </span>
            <p className="text-slate-600 leading-relaxed italic text-[11px]">
              &ldquo;{invoice.notes || "Fees once scheduled cover academic classes and learning materials for the term."}&rdquo;
            </p>
          </div>

          {/* Totals Breakdown */}
          <div className="w-full sm:w-64 space-y-2 text-xs">
            <div className="flex justify-between py-1 text-slate-600">
              <span>Subtotal:</span>
              <span className="font-mono font-medium">{formatINR(invoice.subtotal)}</span>
            </div>

            {invoice.discount > 0 && (
              <div className="flex justify-between py-1 text-emerald-700">
                <span>Fee Concession / Discount:</span>
                <span className="font-mono font-medium">- {formatINR(invoice.discount)}</span>
              </div>
            )}

            <div className="flex justify-between py-1.5 border-t border-slate-200 font-bold text-slate-900 text-sm">
              <span>Total Fee:</span>
              <span className="font-mono">{formatINR(invoice.totalAmount)}</span>
            </div>

            <div className="flex justify-between py-1 text-emerald-600 font-medium">
              <span>Amount Paid:</span>
              <span className="font-mono">{formatINR(invoice.amountPaid)}</span>
            </div>

            <div className="flex justify-between py-2 border-t-2 border-slate-900 font-black text-sm bg-slate-50 px-2 rounded-lg mt-1">
              <span className="text-slate-900">Balance Due:</span>
              <span
                className={`font-mono ${
                  invoice.balanceDue > 0 ? "text-rose-600" : "text-emerald-700"
                }`}
              >
                {formatINR(invoice.balanceDue)}
              </span>
            </div>
          </div>
        </div>

        {/* Document Footer */}
        <div className="pt-6 text-center space-y-1 text-slate-400 text-[10px]">
          <p>This is a computer-generated invoice slip issued via FeePulse for independent tutors.</p>
          <p>For questions or fee reconciliation, please contact your tutor directly.</p>
        </div>
      </div>
    </div>
  );
}
