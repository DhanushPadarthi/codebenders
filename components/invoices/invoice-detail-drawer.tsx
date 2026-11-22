"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Printer,
  Send,
  User,
  CheckCircle2,
  AlertCircle,
  Archive,
  Loader2,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import { PrintableInvoiceSlip } from "./printable-invoice-slip";
import {
  transitionInvoiceStatusAction,
  archiveInvoiceAction,
} from "@/app/actions/invoices";
import { getPaymentsByInvoiceAction } from "@/app/actions/payments";
import { RecordPaymentDrawer } from "@/components/payments/record-payment-drawer";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { PaymentRecord } from "@/lib/dal/payments";

interface InvoiceDetailDrawerProps {
  invoice: InvoiceRecord | null;
  businessName?: string;
  onClose: () => void;
  onStatusUpdated?: (updatedInvoice: InvoiceRecord) => void;
  onInvoiceArchived?: (invoiceId: string) => void;
}

export function InvoiceDetailDrawer({
  invoice: propInvoice,
  businessName,
  onClose,
  onStatusUpdated,
  onInvoiceArchived,
}: InvoiceDetailDrawerProps) {
  const [invoiceOverride, setInvoiceOverride] = useState<InvoiceRecord | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [paymentRefreshKey, setPaymentRefreshKey] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const invoice = invoiceOverride && propInvoice && invoiceOverride.id === propInvoice.id
    ? invoiceOverride
    : propInvoice;

  if (!invoice) return null;

  const isDraft = invoice.status === "draft";
  const isPaid = invoice.status === "paid" || invoice.effectiveStatus === "paid";
  const isOverdue = invoice.status === "overdue" || invoice.effectiveStatus === "overdue";
  const isPartiallyPaid = invoice.status === "partially_paid" || invoice.effectiveStatus === "partially_paid";
  const effectiveStatus = invoice.effectiveStatus || invoice.status;

  const handleMarkAsSent = async () => {
    setIsTransitioning(true);
    setFeedback(null);

    try {
      const res = await transitionInvoiceStatusAction(invoice.id, "sent");
      if (!res.success) {
        setFeedback({ type: "error", message: res.error });
        setIsTransitioning(false);
        return;
      }

      const updated: InvoiceRecord = {
        ...invoice,
        status: res.data.status as InvoiceRecord["status"],
        effectiveStatus: res.data.status as InvoiceRecord["status"],
      };

      setInvoiceOverride(updated);
      setFeedback({
        type: "success",
        message: `Invoice ${invoice.invoiceNumber} transitioned to ${res.data.status.toUpperCase()}. Financial details are now immutable.`,
      });

      if (onStatusUpdated) {
        onStatusUpdated(updated);
      }
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to update invoice status.",
      });
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleArchiveInvoice = async () => {
    setIsArchiving(true);
    setFeedback(null);

    try {
      const res = await archiveInvoiceAction(invoice.id);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error });
        setIsArchiving(false);
        setConfirmArchive(false);
        return;
      }

      setFeedback({
        type: "success",
        message: `Invoice ${invoice.invoiceNumber} has been voided/cancelled via audited soft delete.`,
      });

      if (onInvoiceArchived) {
        onInvoiceArchived(invoice.id);
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to void invoice.",
      });
      setIsArchiving(false);
      setConfirmArchive(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
          <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-200 bg-slate-900 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-slate-300">
                      {invoice.invoiceNumber}
                    </span>
                    <Badge
                      variant={
                        isPaid
                          ? "success"
                          : isOverdue
                          ? "danger"
                          : isPartiallyPaid
                          ? "warning"
                          : isDraft
                          ? "secondary"
                          : "info"
                      }
                      className="text-[10px]"
                    >
                      {effectiveStatus.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight">
                    {invoice.customerName}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Batch: {invoice.customerGrade} • Tuition Invoice
                  </p>
                </div>

                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Feedback Alert */}
            {feedback && (
              <div
                className={`p-3.5 border-b text-xs flex items-center justify-between ${
                  feedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  {feedback.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
                <button
                  onClick={() => setFeedback(null)}
                  className="text-xs font-bold px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Draft Notice if applicable */}
              {isDraft && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-bold block mb-0.5">
                      Draft Invoice (Editable)
                    </span>
                    <p className="text-amber-800 leading-relaxed text-[11px]">
                      This invoice is currently in draft status. When finalized, mark it as <strong>Sent</strong> to lock financial line items and activate payment reconciliation.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleMarkAsSent}
                    disabled={isTransitioning}
                    className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 text-xs gap-1.5 font-semibold"
                  >
                    {isTransitioning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Finalizing...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Mark as Sent</span>
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Student Details Card */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Billed Student Information
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Student Name</span>
                    <span className="font-semibold text-slate-900">{invoice.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Tuition Batch / Class</span>
                    <span className="font-semibold text-slate-900">{invoice.customerGrade}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Parent / Guardian</span>
                    <span className="font-semibold text-slate-900">{invoice.parentName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Parent Mobile Phone</span>
                    <span className="font-semibold text-slate-900 font-mono">
                      {invoice.parentPhone || "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dates & Billing Schedule */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Billing & Payment Dates
                </h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Issue Date</span>
                    <span className="font-medium text-slate-900">{formatDate(invoice.issueDate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Payment Due Date</span>
                    <span
                      className={`font-semibold ${
                        isOverdue ? "text-rose-600" : "text-slate-900"
                      }`}
                    >
                      {formatDate(invoice.dueDate)}
                    </span>
                    {invoice.overdueDays !== undefined && invoice.overdueDays > 0 && (
                      <span className="text-[10px] text-rose-500 block">
                        ({invoice.overdueDays} days overdue)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="p-3 bg-slate-50 border-b border-slate-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Fee Line Items
                  </h4>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 bg-slate-50/50 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Fee Rate</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.items && invoice.items.length > 0 ? (
                      invoice.items.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {it.description}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                            {it.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {formatINR(it.unitPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                            {formatINR(it.totalPrice)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {invoice.customerGrade} - Monthly Tuition Fee
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-600">1</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {formatINR(invoice.subtotal)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                          {formatINR(invoice.subtotal)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals Breakdown Card */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 space-y-2 text-xs">
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium">{formatINR(invoice.subtotal)}</span>
                </div>
                {invoice.discount > 0 && (
                  <div className="flex justify-between py-1 text-emerald-700">
                    <span>Discount / Concession:</span>
                    <span className="font-mono font-medium">- {formatINR(invoice.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-t border-slate-200 font-bold text-slate-900">
                  <span>Total Amount:</span>
                  <span className="font-mono">{formatINR(invoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between py-1 text-emerald-600 font-medium">
                  <span>Amount Paid:</span>
                  <span className="font-mono">{formatINR(invoice.amountPaid)}</span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-slate-900 font-black text-sm bg-white px-3 rounded-lg">
                  <span className="text-slate-900">Remaining Balance:</span>
                  <span
                    className={`font-mono ${
                      invoice.balanceDue > 0 ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {formatINR(invoice.balanceDue)}
                  </span>
                </div>
              </div>

              {/* Recorded Payment History */}
              <InvoicePaymentsSection
                invoiceId={invoice.id}
                isDraft={isDraft}
                balanceDue={invoice.balanceDue}
                onRecordPaymentClick={() => setIsRecordPaymentOpen(true)}
                refreshKey={paymentRefreshKey}
              />

              {/* Notes */}
              {invoice.notes && (
                <div className="rounded-xl border border-slate-200 p-4 bg-white text-xs space-y-1">
                  <span className="font-bold text-slate-700 block">Tuition Terms & Notes</span>
                  <p className="text-slate-600 leading-relaxed italic text-[11px]">
                    &ldquo;{invoice.notes}&rdquo;
                  </p>
                </div>
              )}

              {/* Soft Delete Section (Only if no payments recorded) */}
              {invoice.amountPaid === 0 && (
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-semibold text-slate-800">
                        Archive / Void Invoice
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        Cancels this invoice via audited soft-delete RPC. Records are retained in compliance with financial regulations.
                      </p>
                    </div>

                    {!confirmArchive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmArchive(true)}
                        className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 gap-1.5"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Void</span>
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmArchive(false)}
                          disabled={isArchiving}
                          className="text-xs text-slate-500"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleArchiveInvoice}
                          disabled={isArchiving}
                          className="text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                        >
                          {isArchiving ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Voiding...</span>
                            </>
                          ) : (
                            <span>Confirm Void</span>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Action Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrintModal(true)}
                className="text-xs gap-1.5 text-slate-700 hover:text-slate-900 border-slate-300"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Slip / PDF</span>
              </Button>

              <div className="flex items-center gap-2">
                {!isDraft && invoice.status !== "cancelled" && invoice.balanceDue > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setIsRecordPaymentOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </Button>
                )}

                {isDraft && (
                  <Button
                    size="sm"
                    onClick={handleMarkAsSent}
                    disabled={isTransitioning}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    {isTransitioning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Finalize & Mark Sent</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Record Payment Drawer Modal */}
      <RecordPaymentDrawer
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        preselectedCustomerId={invoice.customerId}
        preselectedInvoiceId={invoice.id}
        onPaymentSuccess={(p, res) => {
          setIsRecordPaymentOpen(false);
          const updated: InvoiceRecord = {
            ...invoice,
            amountPaid: res.amountPaid,
            balanceDue: res.balanceDue,
            status: res.status as InvoiceRecord["status"],
            effectiveStatus: res.status as InvoiceRecord["status"],
          };
          setInvoiceOverride(updated);
          setPaymentRefreshKey((k) => k + 1);
          setFeedback({
            type: "success",
            message: `Recorded payment of ₹${p.amount.toLocaleString("en-IN")}. Updated balance: ₹${res.balanceDue.toLocaleString("en-IN")}`,
          });
          if (onStatusUpdated) onStatusUpdated(updated);
        }}
      />

      {/* Printable Invoice Slip Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/80 p-4 sm:p-6 animate-in fade-in duration-150">
          <div className="max-w-3xl mx-auto my-6">
            <PrintableInvoiceSlip
              invoice={invoice}
              businessName={businessName}
              onBack={() => setShowPrintModal(false)}
              showBackAction
            />
          </div>
        </div>
      )}
    </>
  );
}

function InvoicePaymentsSection({
  invoiceId,
  isDraft,
  balanceDue,
  onRecordPaymentClick,
  refreshKey,
}: {
  invoiceId: string;
  isDraft: boolean;
  balanceDue: number;
  onRecordPaymentClick: () => void;
  refreshKey: number;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    payments: PaymentRecord[];
  }>({
    loading: true,
    error: null,
    payments: [],
  });

  useEffect(() => {
    let isMounted = true;
    getPaymentsByInvoiceAction(invoiceId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success) {
          setState({ loading: false, error: null, payments: res.data });
        } else {
          setState({ loading: false, error: res.error, payments: [] });
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load payments",
          payments: [],
        });
      });
    return () => {
      isMounted = false;
    };
  }, [invoiceId, refreshKey]);

  const { loading, error, payments } = state;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-3.5 h-3.5 text-slate-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Recorded Payments ({payments.length})
          </h4>
        </div>
        {!isDraft && balanceDue > 0 && (
          <Button
            size="sm"
            onClick={onRecordPaymentClick}
            className="h-6 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1"
          >
            + Record Payment
          </Button>
        )}
      </div>

      {loading ? (
        <div className="p-4 text-center text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-slate-500" />
          Loading payment history...
        </div>
      ) : error ? (
        <div className="p-3 text-xs text-rose-600 bg-rose-50 border-b border-rose-100">
          {error}
        </div>
      ) : payments.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500">
          <p className="font-medium text-slate-600">No payments recorded yet</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {isDraft
              ? "Payments can be recorded once this draft is finalized."
              : "Record payments via UPI, Cash, Cheque, or Bank Transfer to reconcile balance."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {payments.map((p) => (
            <div key={p.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50/50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900">{p.receiptNumber}</span>
                  <Badge variant="outline" className="text-[9px] uppercase font-semibold">
                    {p.paymentMode}
                  </Badge>
                </div>
                <div className="text-[11px] text-slate-500">
                  <span>{formatDate(p.paymentDate)}</span>
                  {p.referenceId && p.referenceId !== "—" && (
                    <span className="ml-2 font-mono text-slate-400">Ref: {p.referenceId}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  +{formatINR(p.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
