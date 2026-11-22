"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  User,
  AlertCircle,
  Eye,
  Send,
  Save,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import {
  calculateLineTotal,
  calculateInvoiceTotals,
  INVOICE_ITEM_PRESETS,
  type LineItemInput,
} from "@/lib/finance/invoice-calculations";
import { PrintableInvoiceSlip } from "@/components/invoices/printable-invoice-slip";
import { createInvoiceAction } from "@/app/actions/invoices";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";

interface NewInvoiceClientViewProps {
  customers: CustomerRecord[];
  initialInvoiceNumber: string;
  businessName: string;
  preselectedCustomerId?: string;
}

export function NewInvoiceClientView({
  customers,
  initialInvoiceNumber,
  businessName,
  preselectedCustomerId,
}: NewInvoiceClientViewProps) {
  const router = useRouter();

  const defaultId =
    preselectedCustomerId && customers.some((c) => c.id === preselectedCustomerId)
      ? preselectedCustomerId
      : customers[0]?.id || "";

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(defaultId);
  const selectedStudent = customers.find((c) => c.id === selectedCustomerId);

  // Today's date and due date (7 days later) initialized via pure state factory
  const [initialDates] = useState(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return { today, next };
  });

  const [invoiceNumber] = useState(initialInvoiceNumber);
  const [issueDate, setIssueDate] = useState(initialDates.today);
  const [dueDate, setDueDate] = useState(initialDates.next);
  const [paymentTerms, setPaymentTerms] = useState("Net 7 Days");
  const [notes, setNotes] = useState(
    "Tuition fee covers scheduled subject classes, weekly assignments, and weekend doubt clearing sessions."
  );

  // Line items state
  const [items, setItems] = useState<LineItemInput[]>([
    {
      id: "item-1",
      description: selectedStudent
        ? `${selectedStudent.gradeSubject} - Monthly Tuition Fee`
        : "Monthly Tuition Fee",
      quantity: 1,
      unitPrice: selectedStudent ? selectedStudent.defaultFeeAmount : 7500,
    },
  ]);

  // Discount
  const [discount, setDiscount] = useState<string>("0");

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // When student changes, update prefilled line item if only 1 item exists
  const handleStudentChange = (custId: string) => {
    setSelectedCustomerId(custId);
    const newCust = customers.find((c) => c.id === custId);
    if (newCust && items.length === 1 && items[0].id === "item-1") {
      setItems([
        {
          id: "item-1",
          description: `${newCust.gradeSubject} - Monthly Tuition Fee`,
          quantity: 1,
          unitPrice: newCust.defaultFeeAmount,
        },
      ]);
    }
  };

  // Calculations
  const totals = calculateInvoiceTotals(items, Number(discount) || 0, 0);

  const handleItemChange = (
    index: number,
    field: keyof LineItemInput,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          [field]: field === "description" ? value : Number(value) || 0,
        };
      })
    );
  };

  const handleAddItem = (preset?: {
    label: string;
    defaultPrice: number;
    defaultQty: number;
  }) => {
    const newItem: LineItemInput = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      description:
        preset?.label === "Monthly Tuition Fee"
          ? `${selectedStudent?.gradeSubject || "General Batch"} - Monthly Tuition Fee`
          : preset?.label || "Additional Coaching Item",
      quantity: preset?.defaultQty || 1,
      unitPrice:
        preset?.label === "Monthly Tuition Fee"
          ? selectedStudent?.defaultFeeAmount || 7500
          : preset?.defaultPrice || 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedCustomerId) {
      newErrors.customerId = "Please select a student from your roster.";
    }

    if (!issueDate) {
      newErrors.issueDate = "Issue date is required.";
    }

    if (!dueDate) {
      newErrors.dueDate = "Due date is required.";
    } else if (dueDate < issueDate) {
      newErrors.dueDate = "Due date must be on or after issue date.";
    }

    if (items.length === 0) {
      newErrors.items = "At least one line item is required.";
    } else {
      items.forEach((it, idx) => {
        if (!it.description.trim()) {
          newErrors[`item_${idx}_desc`] = `Item #${idx + 1} requires a description.`;
        }
        if (it.quantity <= 0) {
          newErrors[`item_${idx}_qty`] = `Item #${idx + 1} quantity must be greater than 0.`;
        }
        if (it.unitPrice < 0) {
          newErrors[`item_${idx}_price`] = `Item #${idx + 1} unit fee cannot be negative.`;
        }
      });
    }

    const discNum = Number(discount) || 0;
    if (discNum < 0) {
      newErrors.discount = "Discount cannot be negative.";
    } else if (discNum > totals.subtotal) {
      newErrors.discount = "Discount cannot exceed subtotal amount.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveInvoice = async (targetStatus: "draft" | "sent") => {
    setServerError(null);
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const payload = {
        customerId: selectedCustomerId,
        invoiceNumber,
        issueDate,
        dueDate,
        discount: Number(discount) || 0,
        notes: notes.trim() || undefined,
        status: targetStatus,
        items: items.map((it) => ({
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      };

      const result = await createInvoiceAction(payload);
      if (!result.success) {
        setServerError(result.error);
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(
        `Invoice ${invoiceNumber} created successfully for ${selectedStudent?.name}. Status: ${targetStatus.toUpperCase()}.`
      );

      setTimeout(() => {
        router.push("/invoices");
      }, 1200);
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setIsSubmitting(false);
    }
  };

  // Preview invoice object
  const previewInvoice: InvoiceRecord = {
    id: "preview-temp",
    businessId: "preview-biz",
    customerId: selectedStudent?.id || "preview-cust",
    customerName: selectedStudent?.name || "Student Name",
    customerGrade: selectedStudent?.gradeSubject || "General Batch",
    parentName: selectedStudent?.parentName || "Parent Name",
    parentPhone: selectedStudent?.phone || "+91 98000 00000",
    invoiceNumber,
    issueDate,
    dueDate,
    subtotal: totals.subtotal,
    discount: totals.discount,
    totalAmount: totals.totalAmount,
    amountPaid: 0,
    balanceDue: totals.totalAmount,
    status: "draft",
    effectiveStatus: "draft",
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: items.map((it) => ({
      id: it.id,
      businessId: "preview-biz",
      invoiceId: "preview-temp",
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: calculateLineTotal(it.quantity, it.unitPrice),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/invoices">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Invoices
              </Button>
            </Link>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">Invoice Builder</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            Create Fee Invoice
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Draft or finalize student fee invoice with itemised charges and automatic calculations for{" "}
            <span className="font-semibold text-slate-800">{businessName}</span>.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreviewModal(true)}
            className="text-xs gap-1.5 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Preview Slip</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSubmitting || customers.length === 0}
            onClick={() => handleSaveInvoice("draft")}
            className="text-xs gap-1.5 shadow-2xs"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save Draft</span>
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={isSubmitting || customers.length === 0}
            onClick={() => handleSaveInvoice("sent")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-2xs"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Issue & Mark Sent</span>
          </Button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2.5 shadow-2xs animate-in slide-in-from-top duration-150">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage} Redirecting to invoices directory...</span>
        </div>
      )}

      {/* Server Error Banner */}
      {serverError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2.5 shadow-2xs animate-in slide-in-from-top duration-150">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Error Validation Banner */}
      {Object.keys(errors).length > 0 && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1 animate-in slide-in-from-top duration-150">
          <div className="font-bold flex items-center gap-1.5 text-sm">
            <AlertCircle className="w-4 h-4 text-rose-600" /> Please resolve the following errors:
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-rose-700 pl-1">
            {Object.values(errors).map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty Roster Guard */}
      {customers.length === 0 ? (
        <Card className="border-slate-200 shadow-sm p-10 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
              <User className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              No students enrolled yet
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              You must enroll at least one student in your roster before creating an invoice.
            </p>
            <div className="pt-2">
              <Link href="/customers">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                  Go to Student Directory & Enroll Student
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        /* Main Builder Grid */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cols): Student Selection, Line Items */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Student Selection Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="p-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" />
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Billed Student & Parent
                  </CardTitle>
                </div>
                <CardDescription className="text-xs">
                  Choose the enrolled student to generate fee schedule for.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Select Enrolled Student <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleStudentChange(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.gradeSubject} (Fee: ₹{c.defaultFeeAmount.toLocaleString("en-IN")})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedStudent && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        Tuition Batch
                      </span>
                      <span className="font-semibold text-slate-900">
                        {selectedStudent.gradeSubject}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        Parent / Guardian
                      </span>
                      <span className="font-semibold text-slate-900">
                        {selectedStudent.parentName || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        Contact Mobile
                      </span>
                      <span className="font-semibold text-slate-900 font-mono">
                        {selectedStudent.phone}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Line Items Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Fee Line Items
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Itemise monthly tuition, study materials, or coaching sessions.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-1.5">
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const preset = INVOICE_ITEM_PRESETS.find(
                        (p) => p.label === e.target.value
                      );
                      if (preset) handleAddItem(preset);
                      e.target.value = "";
                    }}
                    defaultValue=""
                    className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
                  >
                    <option value="" disabled>
                      + Quick Preset...
                    </option>
                    {INVOICE_ITEM_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} (₹{p.defaultPrice})
                      </option>
                    ))}
                  </select>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddItem()}
                    className="h-7 text-xs gap-1 border-slate-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-3">
                <div className="space-y-2.5">
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col sm:flex-row items-start sm:items-center gap-3 text-xs"
                    >
                      {/* Description */}
                      <div className="flex-1 w-full">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            handleItemChange(index, "description", e.target.value)
                          }
                          className="w-full text-xs rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      {/* Qty */}
                      <div className="w-20">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(index, "quantity", e.target.value)
                          }
                          className="w-full text-xs rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="w-28">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                          Rate (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleItemChange(index, "unitPrice", e.target.value)
                          }
                          className="w-full text-xs rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>

                      {/* Total */}
                      <div className="w-24 text-right pt-4 sm:pt-0">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase block sm:hidden">
                          Total
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {formatINR(calculateLineTotal(item.quantity, item.unitPrice))}
                        </span>
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        disabled={items.length <= 1}
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors pt-4 sm:pt-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 3. Notes & Payment Terms */}
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Invoice Notes & Tuition Guidelines
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Provide batch details or payment instructions..."
                    className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column (1 Col): Dates, Discount, Summary */}
          <div className="space-y-6">
            {/* Invoice Metadata Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="p-5 pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Billing Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    disabled
                    value={invoiceNumber}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono font-semibold text-slate-700"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Issue Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Payment Due Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Payment Terms
                  </label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="Due on Receipt">Due on Receipt</option>
                    <option value="Net 7 Days">Net 7 Days</option>
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {/* Financial Summary Card */}
            <Card className="border-slate-200 shadow-sm bg-gradient-to-b from-white to-slate-50/50">
              <CardHeader className="p-5 pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Fee Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3 text-xs">
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-medium">{formatINR(totals.subtotal)}</span>
                </div>

                <div>
                  <div className="flex items-center justify-between py-1">
                    <label className="text-slate-600">Discount / Concession (₹):</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-24 text-right rounded-md border border-slate-200 px-2 py-1 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  {totals.discount > 0 && (
                    <p className="text-[10px] text-emerald-600 text-right">
                      - {formatINR(totals.discount)}
                    </p>
                  )}
                </div>

                <div className="flex justify-between py-2 border-t border-slate-200 font-bold text-slate-900 text-sm">
                  <span>Total Amount:</span>
                  <span className="font-mono">{formatINR(totals.totalAmount)}</span>
                </div>

                <div className="flex justify-between py-2 border-t-2 border-slate-900 font-black text-sm bg-slate-900 text-white p-3 rounded-xl mt-2">
                  <span>Balance Due:</span>
                  <span className="font-mono text-emerald-400">
                    {formatINR(totals.balanceDue)}
                  </span>
                </div>

                <div className="pt-4 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting || customers.length === 0}
                    onClick={() => handleSaveInvoice("draft")}
                    className="w-full text-xs font-semibold gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save as Draft</span>
                  </Button>

                  <Button
                    type="button"
                    variant="default"
                    disabled={isSubmitting || customers.length === 0}
                    onClick={() => handleSaveInvoice("sent")}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Issue & Mark Sent</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Slip Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-950/80 p-4 sm:p-6 animate-in fade-in duration-150">
          <div className="max-w-3xl mx-auto my-6">
            <PrintableInvoiceSlip
              invoice={previewInvoice}
              businessName={businessName}
              onBack={() => setShowPreviewModal(false)}
              showBackAction
            />
          </div>
        </div>
      )}
    </div>
  );
}
