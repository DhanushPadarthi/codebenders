"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceSummaryCards } from "@/components/invoices/invoice-summary-cards";
import { InvoiceDirectoryTable } from "@/components/invoices/invoice-directory-table";
import { InvoiceDetailDrawer } from "@/components/invoices/invoice-detail-drawer";
import { transitionInvoiceStatusAction } from "@/app/actions/invoices";
import type { InvoiceRecord } from "@/lib/dal/invoices";

interface InvoicesClientViewProps {
  initialInvoices: InvoiceRecord[];
  businessName: string;
  initialSearch?: string;
}

export function InvoicesClientView({
  initialInvoices,
  businessName,
  initialSearch = "",
}: InvoicesClientViewProps) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(initialInvoices);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleMarkAsSent = async (invoiceId: string) => {
    try {
      const res = await transitionInvoiceStatusAction(invoiceId, "sent");
      if (res.success) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId
              ? {
                  ...inv,
                  status: res.data.status as InvoiceRecord["status"],
                  effectiveStatus: res.data.status as InvoiceRecord["status"],
                }
              : inv
          )
        );
        if (selectedInvoice && selectedInvoice.id === invoiceId) {
          setSelectedInvoice((prev) =>
            prev
              ? {
                  ...prev,
                  status: res.data.status as InvoiceRecord["status"],
                  effectiveStatus: res.data.status as InvoiceRecord["status"],
                }
              : null
          );
        }
        showToast(`Invoice transitioned to ${res.data.status.toUpperCase()}. Financial details are now immutable.`);
      } else {
        showToast(res.error, "error");
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to transition status", "error");
    }
  };

  const handleStatusUpdated = (updatedInvoice: InvoiceRecord) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === updatedInvoice.id ? updatedInvoice : inv))
    );
    if (selectedInvoice && selectedInvoice.id === updatedInvoice.id) {
      setSelectedInvoice(updatedInvoice);
    }
    showToast(`Invoice ${updatedInvoice.invoiceNumber} status updated.`);
  };

  const handleInvoiceArchived = (invoiceId: string) => {
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
    if (selectedInvoice?.id === invoiceId) {
      setSelectedInvoice(null);
    }
    showToast("Invoice voided and archived successfully. Financial records retained.");
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
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
            </Link>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">Invoicing Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            Student Fee Invoices
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Generate, issue, and reconcile tuition invoices, printable receipts, and payment statuses for{" "}
            <span className="font-semibold text-slate-800">{businessName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/invoices/new">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-2xs"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Fee Invoice</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between shadow-2xs animate-in slide-in-from-top-2 duration-150 ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-600 hover:text-slate-900 text-xs font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section aria-label="Invoice Metrics">
        <InvoiceSummaryCards invoices={invoices} />
      </section>

      {/* Invoices Directory Table */}
      <section aria-label="Invoice Table">
        <InvoiceDirectoryTable
          invoices={invoices}
          onSelectInvoice={(inv) => setSelectedInvoice(inv)}
          onMarkAsSent={handleMarkAsSent}
          initialSearch={initialSearch}
        />
      </section>

      {/* Invoice Detail & Print Drawer */}
      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        businessName={businessName}
        onClose={() => setSelectedInvoice(null)}
        onStatusUpdated={handleStatusUpdated}
        onInvoiceArchived={handleInvoiceArchived}
      />
    </div>
  );
}
