"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  Phone,
  Mail,
  Calendar,
  FileText,
  CreditCard,
  Send,
  Clock,
  Edit3,
  Archive,
  Loader2,
  Plus,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import { archiveCustomerAction } from "@/app/actions/customers";
import { getInvoicesAction } from "@/app/actions/invoices";
import { getPaymentsByCustomerAction } from "@/app/actions/payments";
import { PrintablePaymentReceipt } from "@/components/payments/printable-payment-receipt";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { PaymentRecord } from "@/lib/dal/payments";

interface StudentProfileDrawerProps {
  student: CustomerRecord | null;
  onClose: () => void;
  onActionFeedback?: (message: string) => void;
  onEditStudent?: (student: CustomerRecord) => void;
  onArchiveStudent?: (student: CustomerRecord) => void;
}

export function StudentProfileDrawer({
  student,
  onClose,
  onActionFeedback,
  onEditStudent,
  onArchiveStudent,
}: StudentProfileDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "invoices" | "payments" | "promises">("overview");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  if (!student) return null;

  // WhatsApp quick link
  const cleanWaNumber = student.whatsappNumber.replace(/\D/g, "");
  const cleanPhone = student.phone.replace(/\D/g, "");
  const whatsappUrl = `https://wa.me/${cleanWaNumber}?text=${encodeURIComponent(
    `Hello ${student.parentName}, this is regarding ${student.name}'s tuition fee schedule.`
  )}`;

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      const result = await archiveCustomerAction(student.id);
      if (result.success) {
        if (onActionFeedback) {
          onActionFeedback(`Successfully archived ${student.name}. Record retained in compliance with audit rules.`);
        }
        if (onArchiveStudent) {
          onArchiveStudent(student);
        }
        onClose();
      } else {
        if (onActionFeedback) {
          onActionFeedback(`Failed to archive student: ${result.error}`);
        }
      }
    } catch (err: unknown) {
      if (onActionFeedback) {
        onActionFeedback(
          `Error archiving student: ${
            err instanceof Error ? err.message : "Unknown error occurred"
          }`
        );
      }
    } finally {
      setIsArchiving(false);
      setConfirmArchive(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-200 bg-slate-900 text-white">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-md">
                  {student.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      {student.name}
                    </h2>
                    <Badge
                      variant={student.status === "active" ? "success" : "secondary"}
                      className="text-[10px]"
                    >
                      {student.status === "active"
                        ? "Active"
                        : student.status === "archived"
                        ? "Archived"
                        : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {student.gradeSubject} • Parent: <span className="font-semibold">{student.parentName}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {onEditStudent && (
                  <button
                    onClick={() => onEditStudent(student)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Edit Student"
                    aria-label="Edit Student"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick KPI Strip */}
            <div className="grid grid-cols-4 gap-2.5 mt-6 pt-5 border-t border-slate-800 text-xs">
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Monthly Fee</span>
                <span className="font-mono font-bold text-slate-100 text-sm">
                  {formatINR(student.defaultFeeAmount)}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Invoiced</span>
                <span className="font-mono font-bold text-slate-100 text-sm">
                  {formatINR(student.totalInvoiced)}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Collected</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {formatINR(student.totalCollected)}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60">
                <span className="text-[11px] text-slate-400 block">Balance Due</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    student.outstandingBalance > 0 ? "text-rose-400" : "text-slate-100"
                  }`}
                >
                  {formatINR(student.outstandingBalance)}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center px-6 border-b border-slate-200 bg-slate-50 text-xs font-medium">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-3 px-3 border-b-2 font-semibold transition-colors ${
                activeTab === "overview"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Overview & Contacts
            </button>
            <button
              onClick={() => setActiveTab("invoices")}
              className={`py-3 px-3 border-b-2 font-semibold transition-colors ${
                activeTab === "invoices"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Invoices
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`py-3 px-3 border-b-2 font-semibold transition-colors ${
                activeTab === "payments"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Receipts
            </button>
            <button
              onClick={() => setActiveTab("promises")}
              className={`py-3 px-3 border-b-2 font-semibold transition-colors ${
                activeTab === "promises"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Promises
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-5">
                {/* Contact Channels Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Parent Contact Channels
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block">Parent / Guardian</span>
                      <span className="font-semibold text-slate-900">{student.parentName}</span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Mobile Phone</span>
                      <a
                        href={`tel:${cleanPhone}`}
                        className="font-semibold text-indigo-600 hover:underline flex items-center gap-1.5 mt-0.5"
                      >
                        <Phone className="w-3.5 h-3.5" /> {student.phone}
                      </a>
                    </div>

                    <div>
                      <span className="text-slate-500 block">WhatsApp Number</span>
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-emerald-600 hover:underline flex items-center gap-1.5 mt-0.5"
                      >
                        <Send className="w-3.5 h-3.5" /> {student.whatsappNumber}
                      </a>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Email Address</span>
                      {student.email ? (
                        <a
                          href={`mailto:${student.email}`}
                          className="font-semibold text-slate-800 hover:underline flex items-center gap-1.5 mt-0.5"
                        >
                          <Mail className="w-3.5 h-3.5 text-slate-400" /> {student.email}
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">Not provided</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tuition & Billing Cycle Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Tuition Batch & Billing Terms
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block">Class / Subject Batch</span>
                      <span className="font-semibold text-slate-900">{student.gradeSubject}</span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Billing Cycle Due Day</span>
                      <span className="font-semibold text-slate-900 flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" /> Day {student.billingCycleDay} of every month
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Next Scheduled Due Date</span>
                      <span className="font-semibold text-slate-900">
                        {student.nextPaymentDate !== "—" ? formatDate(student.nextPaymentDate) : "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block">Enrolled On</span>
                      <span className="text-slate-700">{formatDate(student.joinedDate)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes Card */}
                {student.notes && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                    <span className="font-bold text-slate-700 block mb-1">Academic & Payment Notes</span>
                    <p className="text-slate-600 leading-relaxed italic">&ldquo;{student.notes}&rdquo;</p>
                  </div>
                )}

                {/* Archive Section */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-semibold text-slate-800">
                        Archive Student Record
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        Soft-deletes the student from active rosters. Financial records remain protected.
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
                        <span>Archive</span>
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
                          onClick={handleArchive}
                          disabled={isArchiving}
                          className="text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                        >
                          {isArchiving ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Archiving...</span>
                            </>
                          ) : (
                            <span>Confirm</span>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* INVOICES TAB */}
            {activeTab === "invoices" && (
              <StudentInvoicesTab studentId={student.id} studentName={student.name} />
            )}

            {/* PAYMENTS TAB */}
            {activeTab === "payments" && (
              <StudentPaymentsTab studentId={student.id} studentName={student.name} />
            )}

            {/* PROMISES TAB */}
            {activeTab === "promises" && (
              <div className="space-y-4">
                <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs p-6">
                  <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="font-semibold text-slate-800 text-sm">No recorded promises</p>
                  <p className="mt-1 text-slate-500 max-w-sm mx-auto">
                    WhatsApp payment promises parsed with Groq AI will appear here for follow-up tracking.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Quick Action Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send WhatsApp</span>
            </a>

            <div className="flex items-center gap-2">
              {onEditStudent && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={() => onEditStudent(student)}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentInvoicesTab({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    invoices: InvoiceRecord[];
  }>({
    loading: true,
    error: null,
    invoices: [],
  });

  useEffect(() => {
    let isMounted = true;
    getInvoicesAction({ customerId: studentId })
      .then((result) => {
        if (!isMounted) return;
        if (result.success) {
          setState({ loading: false, error: null, invoices: result.data });
        } else {
          setState({ loading: false, error: result.error, invoices: [] });
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load invoices",
          invoices: [],
        });
      });
    return () => {
      isMounted = false;
    };
  }, [studentId]);

  if (state.loading) {
    return (
      <div className="py-12 text-center text-slate-500 text-xs">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
        <span>Loading student invoices...</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
        <span>Failed to load invoices: {state.error}</span>
      </div>
    );
  }

  if (state.invoices.length === 0) {
    return (
      <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs p-6 space-y-3">
        <FileText className="w-8 h-8 text-slate-400 mx-auto" />
        <div>
          <p className="font-semibold text-slate-800 text-sm">
            No invoices issued for {studentName}
          </p>
          <p className="mt-1 text-slate-500 max-w-sm mx-auto">
            Generate monthly fee invoices with itemised coaching charges and automatic due date tracking.
          </p>
        </div>
        <Link href={`/invoices/new?customerId=${studentId}`}>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 mt-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create First Invoice</span>
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Fee Invoices ({state.invoices.length})
          </h4>
          <p className="text-[11px] text-slate-400">
            Persistent billing history and payment status from PostgreSQL.
          </p>
        </div>
        <Link href={`/invoices/new?customerId=${studentId}`}>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 shadow-2xs h-7"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Invoice</span>
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {state.invoices.map((inv) => (
          <div
            key={inv.id}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2.5 text-xs shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {inv.invoiceNumber}
                </span>
                <Badge
                  variant={
                    inv.status === "paid"
                      ? "success"
                      : inv.status === "overdue"
                      ? "danger"
                      : inv.status === "partially_paid"
                      ? "warning"
                      : inv.status === "sent"
                      ? "info"
                      : "secondary"
                  }
                  className="text-[10px]"
                >
                  {inv.status}
                </Badge>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatINR(inv.totalAmount)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 text-slate-500 border-t border-slate-100">
              <div>
                <span className="block text-[10px] text-slate-400">Issue Date</span>
                <span className="font-medium text-slate-700">{formatDate(inv.issueDate)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Due Date</span>
                <span className="font-medium text-slate-700">{formatDate(inv.dueDate)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Paid Amount</span>
                <span className="font-mono font-medium text-emerald-700">{formatINR(inv.amountPaid)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Balance Due</span>
                <span className="font-mono font-bold text-rose-600">{formatINR(inv.balanceDue)}</span>
              </div>
            </div>

            {inv.items && inv.items.length > 0 && (
              <div className="pt-1.5 border-t border-slate-100 text-[11px] text-slate-500">
                <span className="font-medium text-slate-600">Line Items: </span>
                {inv.items.map((it) => it.description).join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentPaymentsTab({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
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
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);

  useEffect(() => {
    let isMounted = true;
    getPaymentsByCustomerAction(studentId)
      .then((result) => {
        if (!isMounted) return;
        if (result.success) {
          setState({ loading: false, error: null, payments: result.data });
        } else {
          setState({ loading: false, error: result.error, payments: [] });
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load payment history",
          payments: [],
        });
      });
    return () => {
      isMounted = false;
    };
  }, [studentId]);

  if (state.loading) {
    return (
      <div className="py-12 text-center text-slate-500 text-xs">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
        <span>Loading student payments...</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
        <span>Failed to load payments: {state.error}</span>
      </div>
    );
  }

  if (state.payments.length === 0) {
    return (
      <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs p-6 space-y-3">
        <CreditCard className="w-8 h-8 text-slate-400 mx-auto" />
        <div>
          <p className="font-semibold text-slate-800 text-sm">
            No payments recorded for {studentName}
          </p>
          <p className="mt-1 text-slate-500 max-w-sm mx-auto">
            Fee payments recorded via UPI, Cash, Cheque, or Bank Transfer will appear here with printable receipts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Payment Receipts ({state.payments.length})
          </h4>
          <p className="text-[11px] text-slate-400">
            Audit-verified fee settlement history from PostgreSQL.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {state.payments.map((p) => (
          <div
            key={p.id}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-2 text-xs shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {p.receiptNumber}
                </span>
                <Badge variant="outline" className="text-[9px] uppercase font-semibold">
                  {p.paymentMode}
                </Badge>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  +{formatINR(p.amount)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1 text-slate-500 border-t border-slate-100">
              <div>
                <span className="block text-[10px] text-slate-400">Date</span>
                <span className="font-medium text-slate-700">{formatDate(p.paymentDate)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Invoice</span>
                <span className="font-mono font-medium text-slate-700">{p.invoiceNumber}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400">Reference / UTR</span>
                <span className="font-mono font-medium text-slate-700">{p.referenceId || "—"}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedReceipt(p)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
              >
                View Receipt Slip →
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedReceipt && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/80 p-4 sm:p-6 animate-in fade-in duration-150">
          <div className="max-w-2xl mx-auto my-6">
            <PrintablePaymentReceipt
              payment={selectedReceipt}
              onBack={() => setSelectedReceipt(null)}
              showBackAction
            />
          </div>
        </div>
      )}
    </div>
  );
}
