"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Printer,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/formatters";
import {
  recordPaymentAction,
  getPaymentByIdAction,
} from "@/app/actions/payments";
import { getCustomersAction } from "@/app/actions/customers";
import { getInvoicesAction } from "@/app/actions/invoices";
import type { PaymentRecord, RecordPaymentResult, PaymentMode } from "@/lib/dal/payments";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";

export interface RecordPaymentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customers?: CustomerRecord[];
  invoices?: InvoiceRecord[];
  preselectedCustomerId?: string;
  preselectedInvoiceId?: string;
  onPaymentSuccess?: (payment: PaymentRecord, result: RecordPaymentResult) => void;
  onViewReceipt?: (payment: PaymentRecord) => void;
}

export function RecordPaymentDrawer(props: RecordPaymentDrawerProps) {
  const { isOpen, customers: propCustomers, invoices: propInvoices } = props;

  const [asyncData, setAsyncData] = useState<{
    loading: boolean;
    customers: CustomerRecord[];
    invoices: InvoiceRecord[];
  }>({
    loading: !propCustomers || !propInvoices,
    customers: propCustomers || [],
    invoices: propInvoices || [],
  });

  useEffect(() => {
    if (!isOpen) return;
    if (propCustomers && propInvoices) return;

    let isMounted = true;
    Promise.all([getCustomersAction(), getInvoicesAction()])
      .then(([cRes, iRes]) => {
        if (!isMounted) return;
        setAsyncData({
          loading: false,
          customers: cRes.success ? cRes.data : [],
          invoices: iRes.success ? iRes.data : [],
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setAsyncData((prev) => ({ ...prev, loading: false }));
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, propCustomers, propInvoices]);

  if (!isOpen) return null;

  const effectiveCustomers = propCustomers || asyncData.customers;
  const effectiveInvoices = propInvoices || asyncData.invoices;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Record Fee Payment
                </h2>
                <p className="text-xs text-slate-300">
                  Settle student fees, generate receipts, and reconcile receivables
                </p>
              </div>
            </div>

            <button
              onClick={props.onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {asyncData.loading && (!propCustomers || !propInvoices) ? (
              <div className="py-16 text-center text-slate-500 text-xs">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-2" />
                <span>Loading student accounts & invoices...</span>
              </div>
            ) : (
              <RecordPaymentForm
                {...props}
                customers={effectiveCustomers}
                invoices={effectiveInvoices}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordPaymentForm({
  onClose,
  customers,
  invoices,
  preselectedCustomerId,
  preselectedInvoiceId,
  onPaymentSuccess,
  onViewReceipt,
}: {
  onClose: () => void;
  customers: CustomerRecord[];
  invoices: InvoiceRecord[];
  preselectedCustomerId?: string;
  preselectedInvoiceId?: string;
  onPaymentSuccess?: (payment: PaymentRecord, result: RecordPaymentResult) => void;
  onViewReceipt?: (payment: PaymentRecord) => void;
}) {
  // Pure initial state computation without effect cascading
  const initialCustomerId = (() => {
    if (preselectedCustomerId) return preselectedCustomerId;
    const studentWithOpenInvoice = customers.find((c) =>
      invoices.some(
        (inv) =>
          inv.customerId === c.id &&
          inv.status !== "draft" &&
          inv.status !== "paid" &&
          inv.status !== "cancelled" &&
          inv.balanceDue > 0
      )
    );
    return studentWithOpenInvoice?.id || customers[0]?.id || "";
  })();

  const initialInvoiceId = (() => {
    if (preselectedInvoiceId) return preselectedInvoiceId;
    const matched = invoices.find(
      (inv) =>
        inv.customerId === initialCustomerId &&
        inv.status !== "draft" &&
        inv.status !== "paid" &&
        inv.status !== "cancelled" &&
        inv.balanceDue > 0
    );
    return matched?.id || "";
  })();

  const initialInvoice = invoices.find((inv) => inv.id === initialInvoiceId);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(initialInvoiceId);
  const [paymentAmount, setPaymentAmount] = useState<string>(
    initialInvoice ? initialInvoice.balanceDue.toString() : ""
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("upi");
  const [referenceId, setReferenceId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>("");

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordedPayment, setRecordedPayment] = useState<PaymentRecord | null>(null);
  const [paymentResult, setPaymentResult] = useState<RecordPaymentResult | null>(null);

  // Selected customer object
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Eligible invoices for the currently chosen student
  const eligibleInvoices = invoices.filter((inv) => {
    return (
      inv.customerId === selectedCustomerId &&
      inv.status !== "draft" &&
      inv.status !== "paid" &&
      inv.status !== "cancelled" &&
      inv.balanceDue > 0
    );
  });

  const selectedInvoice = invoices.find((inv) => inv.id === selectedInvoiceId);

  // Event handler for student change
  const handleStudentChange = (newCustId: string) => {
    setSelectedCustomerId(newCustId);
    const matchedInvoices = invoices.filter(
      (inv) =>
        inv.customerId === newCustId &&
        inv.status !== "draft" &&
        inv.status !== "paid" &&
        inv.status !== "cancelled" &&
        inv.balanceDue > 0
    );

    if (matchedInvoices.length > 0) {
      setSelectedInvoiceId(matchedInvoices[0].id);
      setPaymentAmount(matchedInvoices[0].balanceDue.toString());
    } else {
      setSelectedInvoiceId("");
      setPaymentAmount("");
    }
  };

  // Event handler for invoice change
  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      setPaymentAmount(inv.balanceDue.toString());
    }
  };

  // Live calculation of remaining balance before and after (in integer paise)
  const parsedAmount = Math.max(0, Number(paymentAmount) || 0);
  const currentBalance = selectedInvoice ? selectedInvoice.balanceDue : 0;
  const currentTotal = selectedInvoice ? selectedInvoice.totalAmount : 0;
  const currentPaid = selectedInvoice ? selectedInvoice.amountPaid : 0;

  const balancePaise = Math.round(currentBalance * 100);
  const payPaise = Math.round(parsedAmount * 100);
  const newBalancePaise = Math.max(0, balancePaise - payPaise);
  const projectedNewBalance = newBalancePaise / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedCustomerId) {
      setFormError("Please select a student.");
      return;
    }

    if (!selectedInvoice) {
      setFormError("Please select an eligible invoice with an outstanding balance.");
      return;
    }

    if (parsedAmount <= 0) {
      setFormError("Payment amount must be greater than zero.");
      return;
    }

    if (payPaise > balancePaise) {
      setFormError(
        `Payment amount (₹${parsedAmount.toLocaleString("en-IN")}) exceeds remaining invoice balance (₹${currentBalance.toLocaleString("en-IN")}). Overpayments are rejected.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await recordPaymentAction({
        invoiceId: selectedInvoice.id,
        amount: parsedAmount,
        paymentMode,
        paymentDate,
        referenceId: referenceId.trim() || null,
        notes: notes.trim() || null,
      });

      if (!res.success) {
        setFormError(res.error);
        setIsSubmitting(false);
        return;
      }

      setPaymentResult(res.data);

      // Fetch the full recorded payment row for display and receipt generation
      const paymentDetailRes = await getPaymentByIdAction(res.data.paymentId);
      const fullPayment: PaymentRecord = paymentDetailRes.success && paymentDetailRes.data
        ? paymentDetailRes.data
        : {
            id: res.data.paymentId,
            businessId: selectedInvoice.businessId,
            invoiceId: selectedInvoice.id,
            customerId: selectedCustomerId,
            amount: parsedAmount,
            amountPaise: payPaise,
            paymentDate,
            paymentMode,
            referenceId: referenceId.trim() || "—",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customerName: selectedCustomer?.name || selectedInvoice.customerName,
            customerGrade: selectedCustomer?.gradeSubject || selectedInvoice.customerGrade,
            parentName: selectedCustomer?.parentName || selectedInvoice.parentName || "—",
            parentPhone: selectedCustomer?.phone || selectedInvoice.parentPhone || "—",
            invoiceNumber: selectedInvoice.invoiceNumber,
            receiptNumber: `REC-${paymentDate.slice(0, 4)}-${res.data.paymentId.replace(/\D/g, "").slice(-4) || "0001"}`,
          };

      setRecordedPayment(fullPayment);

      if (onPaymentSuccess) {
        onPaymentSuccess(fullPayment, res.data);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to record payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForAnother = () => {
    setRecordedPayment(null);
    setPaymentResult(null);
    setPaymentAmount("");
    setReferenceId("");
    setNotes("");
    setFormError(null);
  };

  return (
    <>
      {recordedPayment && paymentResult ? (
        /* Success View */
        <div className="space-y-6 animate-in fade-in duration-200 py-4">
          <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-600 text-white mx-auto flex items-center justify-center shadow-md">
              <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-emerald-950">
                Payment Successfully Recorded!
              </h3>
              <p className="text-xs text-emerald-800 mt-1">
                Receipt <span className="font-mono font-bold">{recordedPayment.receiptNumber}</span> has been issued.
              </p>
            </div>
            <div className="inline-block px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs font-mono font-bold text-emerald-900 shadow-2xs">
              Received: {formatINR(recordedPayment.amount)} via {recordedPayment.paymentMode.toUpperCase()}
            </div>
          </div>

          {/* Status Synchronization Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
            <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px] block">
              Updated Financial Status
            </span>
            <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
              <span>Student:</span>
              <span className="font-semibold text-slate-900">{recordedPayment.customerName}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
              <span>Invoice:</span>
              <span className="font-mono font-semibold text-slate-900">{recordedPayment.invoiceNumber}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
              <span>New Balance Remaining:</span>
              <span
                className={`font-mono font-bold ${
                  paymentResult.balanceDue === 0 ? "text-emerald-700" : "text-rose-600"
                }`}
              >
                {formatINR(paymentResult.balanceDue)}
              </span>
            </div>
            <div className="flex justify-between py-1 text-slate-600">
              <span>Invoice Status:</span>
              <Badge variant={paymentResult.balanceDue === 0 ? "success" : "warning"} className="text-[10px]">
                {paymentResult.status.toUpperCase()}
              </Badge>
            </div>
          </div>

          <div className="space-y-2.5">
            <Button
              onClick={() => {
                if (onViewReceipt) {
                  onViewReceipt(recordedPayment);
                } else {
                  onClose();
                }
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2.5 shadow-2xs gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>View / Print Receipt ({recordedPayment.receiptNumber})</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleResetForAnother}
              className="w-full text-xs py-2.5"
            >
              <span>Record Another Payment</span>
            </Button>
          </div>
        </div>
      ) : (
        /* The Payment Recording Form */
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error Banner */}
          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in shake duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold block">Validation Error</span>
                <p className="text-[11px] mt-0.5">{formError}</p>
              </div>
            </div>
          )}

          {/* 1. Student Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>1. Select Student</span>
              <span className="text-[11px] text-slate-400 font-normal">Active Tuition Roster</span>
            </label>
            <div className="relative">
              <select
                value={selectedCustomerId}
                onChange={(e) => handleStudentChange(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.gradeSubject || "General"}) — Balance: ₹{c.outstandingBalance.toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            </div>
            {selectedCustomer && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                <div>
                  Parent: <span className="font-semibold text-slate-900">{selectedCustomer.parentName || "—"}</span>
                </div>
                <div>
                  Contact: <span className="font-mono text-slate-900">{selectedCustomer.phone}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Invoice Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>2. Select Open Invoice</span>
              <span className="text-[11px] text-slate-400 font-normal">
                {eligibleInvoices.length} eligible invoice(s)
              </span>
            </label>

            {eligibleInvoices.length > 0 ? (
              <select
                value={selectedInvoiceId}
                onChange={(e) => handleInvoiceChange(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                {eligibleInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — Total ₹{inv.totalAmount.toLocaleString("en-IN")} (Due: ₹{inv.balanceDue.toLocaleString("en-IN")} • Status: {inv.status.toUpperCase()})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>No Open Invoices Found</span>
                </div>
                <p className="text-[11px] text-amber-700 mt-1">
                  All invoices for this student are either fully paid, cancelled, or in draft state.
                </p>
              </div>
            )}
          </div>

          {/* Invoice Financial State Box */}
          {selectedInvoice && (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>Invoice Number:</span>
                <span className="font-mono font-bold text-slate-900">{selectedInvoice.invoiceNumber}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>Invoice Total:</span>
                <span className="font-mono text-slate-900">{formatINR(currentTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>Previously Paid:</span>
                <span className="font-mono text-emerald-700 font-semibold">{formatINR(currentPaid)}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900">
                <span>Remaining Balance:</span>
                <span className="font-mono text-rose-600 text-sm">{formatINR(currentBalance)}</span>
              </div>
            </div>
          )}

          {/* 3. Payment Amount Input & Quick Chips */}
          {selectedInvoice && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>3. Payment Amount (₹)</span>
                <span className="text-[11px] text-slate-500">Max ₹{currentBalance.toLocaleString("en-IN")}</span>
              </label>

              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-sm">₹</span>
                <input
                  type="number"
                  min="1"
                  max={currentBalance}
                  step="1"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                  disabled={isSubmitting}
                />
              </div>

              {/* Quick Amount Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPaymentAmount(currentBalance.toString())}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-semibold transition-colors flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>Pay Full Balance (₹{currentBalance.toLocaleString("en-IN")})</span>
                </button>

                {currentBalance > 2000 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount((Math.round(currentBalance / 2)).toString())}
                    disabled={isSubmitting}
                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[11px] font-medium transition-colors"
                  >
                    50% Part-Pay (₹{(Math.round(currentBalance / 2)).toLocaleString("en-IN")})
                  </button>
                )}

                {currentBalance >= 1000 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount("1000")}
                    disabled={isSubmitting}
                    className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[11px] font-medium transition-colors"
                  >
                    ₹1,000
                  </button>
                )}
              </div>

              {/* Real-time Balance Preview (Before and After) */}
              {parsedAmount > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2 text-xs mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Real-time Balance Preview
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Balance Before Payment:</span>
                    <span className="font-mono font-semibold text-white">{formatINR(currentBalance)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400 font-semibold">
                    <span>Payment Being Recorded:</span>
                    <span className="font-mono text-emerald-300">+{formatINR(parsedAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-800 font-extrabold text-white">
                    <span>Balance Remaining After:</span>
                    <span
                      className={`font-mono text-sm ${
                        projectedNewBalance === 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {formatINR(projectedNewBalance)}
                    </span>
                  </div>
                  <div className="pt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Projected Invoice Status:</span>
                    <Badge
                      variant={projectedNewBalance === 0 ? "success" : "warning"}
                      className="text-[10px]"
                    >
                      {projectedNewBalance === 0 ? "FULLY PAID" : "PARTIALLY PAID"}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Payment Mode & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Payment Method
              </label>
              <select
                value={paymentMode}
                onChange={(e) =>
                  setPaymentMode(e.target.value as PaymentMode)
                }
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="upi">UPI (Google Pay / PhonePe / Paytm)</option>
                <option value="cash">Cash (Front Desk)</option>
                <option value="bank_transfer">Bank Transfer / NEFT / IMPS</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                required
              />
            </div>
          </div>

          {/* 5. Transaction Reference ID */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Transaction / UTR Reference</span>
              <span className="text-[11px] text-slate-400 font-normal">
                {paymentMode === "cash" ? "Optional for cash" : "Recommended for audit"}
              </span>
            </label>
            <input
              type="text"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              disabled={isSubmitting}
              placeholder={
                paymentMode === "cash"
                  ? "e.g. RCPT-CASH-410"
                  : paymentMode === "cheque"
                  ? "e.g. Cheque #492019"
                  : "e.g. UPI/632198745612"
              }
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* 6. Notes */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Notes / Remarks
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Balance ₹2,000 promised by Saturday"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Submit Action Button */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={!selectedInvoice || parsedAmount <= 0 || isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs py-3 rounded-xl shadow-xs gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Recording via Database RPC...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Record Payment of ₹{parsedAmount > 0 ? parsedAmount.toLocaleString("en-IN") : "0"}
                  </span>
                </>
              )}
            </Button>
            <p className="text-[10px] text-center text-slate-400 mt-2">
              Atomic PostgreSQL RPC • Reconciles invoice balance and updates ledger
            </p>
          </div>
        </form>
      )}
    </>
  );
}
