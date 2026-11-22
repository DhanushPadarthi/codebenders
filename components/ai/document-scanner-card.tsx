"use client";

import React, { useState } from "react";
import { useFeePulse } from "@/lib/invoice-context";
import { ReceiptExtractResult, PaymentScreenshotResult } from "@/lib/ai/groq-client";
import { formatINR } from "@/lib/formatters";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ScanLine,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileText,
  CreditCard,
  Receipt,
  Loader2,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Plus,
} from "lucide-react";
import { createBillAction } from "@/app/actions/bills";
import { uiCategoryToDb, type BillRecord } from "@/lib/dal/bills";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";

export interface DocumentScannerCardProps {
  customers?: CustomerRecord[];
  invoices?: InvoiceRecord[];
  onProceedToRecordPayment?: (prefill: {
    customerId?: string;
    invoiceId?: string;
    amount?: number;
    referenceId?: string;
  }) => void;
  onExpenseCreated?: (bill: BillRecord) => void;
}

export function DocumentScannerCard({
  customers: propCustomers,
  invoices: propInvoices,
  onProceedToRecordPayment,
  onExpenseCreated,
}: DocumentScannerCardProps) {
  const context = useFeePulse();
  const customers = propCustomers ?? (context.customers as unknown as CustomerRecord[]);
  const invoices = propInvoices ?? (context.invoices as unknown as InvoiceRecord[]);

  const [scanType, setScanType] = useState<"receipt" | "payment_screenshot">("receipt");
  const [imageBase64, setImageBase64] = useState<string>("");
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Extracted results state
  const [receiptResult, setReceiptResult] = useState<ReceiptExtractResult | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentScreenshotResult | null>(null);

  // Editable confirmation states for Expense
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseVendor, setExpenseVendor] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseCategory, setExpenseCategory] = useState("Materials");
  const [expenseDueDate, setExpenseDueDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Editable confirmation states for Payment Screenshot
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [utrRef, setUtrRef] = useState<string>("");

  // Sample placeholder base64 images (1x1 pixel valid base64 for fast 1-click test)
  const dummyBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const handleLoadSample = (type: "receipt" | "payment_screenshot") => {
    setScanType(type);
    setImageBase64(dummyBase64);
    setImageMime("image/png");
    setImagePreviewUrl("data:image/png;base64," + dummyBase64);
    setFileName(type === "receipt" ? "sample_stationery_bill.png" : "sample_gpay_payment_6000.png");
    setReceiptResult(null);
    setPaymentResult(null);
    setErrorMsg(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMsg("Unsupported image format. Please upload JPEG, PNG, or WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("File exceeds maximum allowed size of 5MB.");
      return;
    }

    setFileName(file.name);
    setImageMime(file.type);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64Data = resultStr.split(",")[1];
      setImageBase64(base64Data);
      setImagePreviewUrl(resultStr);
    };
    reader.readAsDataURL(file);
  };

  const handleScanDocument = async () => {
    if (!imageBase64) {
      setErrorMsg("Please upload or load an image to scan.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessToast(null);

    try {
      const res = await fetch("/api/ai/extract-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: imageMime,
          type: scanType,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.message || "Failed to scan document");
      }

      if (scanType === "receipt") {
        const data: ReceiptExtractResult = json.data;
        setReceiptResult(data);
        setExpenseTitle(data.merchantName ? `${data.merchantName} Bill` : "Vendor Expense Bill");
        setExpenseVendor(data.merchantName || "Local Vendor");
        setExpenseAmount(data.totalAmount || 0);
        setExpenseCategory(data.category || "Materials");
        setExpenseDueDate(data.transactionDate || new Date().toISOString().split("T")[0]);
      } else {
        const data: PaymentScreenshotResult = json.data;
        setPaymentResult(data);
        setPaymentAmount(data.amount || 0);
        setUtrRef(data.utrReference || "");

        // Pre-match student if payer name found
        if (data.payerName) {
          const query = data.payerName.toLowerCase();
          const match = customers.find((c) => {
            const cName = (c.name || "").toLowerCase();
            const pName = (c.parentName || "").toLowerCase();
            return cName.includes(query) || pName.includes(query);
          });
          if (match) {
            setSelectedCustomerId(match.id);
            const openInv = invoices.find((i) => i.customerId === match.id && i.balanceDue > 0);
            if (openInv) setSelectedInvoiceId(openInv.id);
          }
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDraftExpense = async () => {
    if (expenseAmount <= 0) {
      setErrorMsg("Expense amount must be greater than zero.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const dbCategory = uiCategoryToDb(expenseCategory);
      const actionRes = await createBillAction({
        title: expenseTitle.trim() || "Scanned Vendor Bill",
        vendorName: expenseVendor.trim() || "Vendor",
        amount: expenseAmount,
        category: dbCategory,
        dueDate: expenseDueDate || new Date().toISOString().split("T")[0],
        isRecurring: false,
        notes: receiptResult?.notes || "Extracted via Groq Vision OCR",
      });

      if (!actionRes.success) {
        setErrorMsg(actionRes.error || "Failed to create expense bill.");
        return;
      }

      onExpenseCreated?.(actionRes.data);
      setSuccessToast(
        `Draft expense bill of ₹${expenseAmount.toLocaleString("en-IN")} added to expenses!`
      );
      setReceiptResult(null);
      setImageBase64("");
      setImagePreviewUrl(null);
      setExpenseTitle("");
      setExpenseVendor("");
      setExpenseAmount(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToPaymentHandoff = () => {
    if (!selectedCustomerId) {
      setErrorMsg("Please select the matching student before recording payment.");
      return;
    }

    onProceedToRecordPayment?.({
      customerId: selectedCustomerId,
      invoiceId: selectedInvoiceId || undefined,
      amount: paymentAmount,
      referenceId: utrRef,
    });
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
              <ScanLine className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Receipt &amp; Payment Ledger Scanner
              </CardTitle>
              <CardDescription>
                Scan paper vendor receipts or student UPI confirmation screenshots using Groq multimodal vision models.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-slate-50 text-blue-800 border-blue-200 self-start sm:self-auto">
            qwen/qwen3.8-27b Vision
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5 text-xs">
        {/* Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 max-w-md">
          <button
            type="button"
            onClick={() => {
              setScanType("receipt");
              setReceiptResult(null);
              setPaymentResult(null);
              setErrorMsg(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              scanType === "receipt"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-blue-600" />
            Vendor Expense Bill
          </button>
          <button
            type="button"
            onClick={() => {
              setScanType("payment_screenshot");
              setReceiptResult(null);
              setPaymentResult(null);
              setErrorMsg(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              scanType === "payment_screenshot"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
            UPI Payment Screenshot
          </button>
        </div>

        {/* Upload Dropzone & Quick Samples */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">
              Upload Document Image (JPEG, PNG, WebP &lt; 5MB):
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Or test with:</span>
              <button
                type="button"
                onClick={() => handleLoadSample(scanType)}
                className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-medium"
              >
                Sample {scanType === "receipt" ? "Bill" : "UPI"}
              </button>
            </div>
          </div>

          <div className="p-5 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center text-center transition-all">
            {imagePreviewUrl ? (
              <div className="space-y-2 flex flex-col items-center">
                <div className="w-24 h-24 rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden flex items-center justify-center p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreviewUrl}
                    alt="Uploaded preview"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>{fileName}</span>
                </div>
                <label className="text-[11px] text-blue-600 hover:text-blue-800 cursor-pointer font-semibold underline">
                  Choose another file
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <label className="cursor-pointer space-y-2 flex flex-col items-center">
                <div className="p-3 rounded-full bg-blue-50 text-blue-600">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-slate-800 font-semibold">
                  Click to browse or drag and drop an image
                </div>
                <p className="text-slate-400 text-[11px]">
                  Supports coaching receipts, printing bills, or UPI PhonePe/GPay transaction screenshots
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleScanDocument}
              disabled={isLoading || !imageBase64}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Document with Vision...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Scan with Groq Vision</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Toast */}
        {successToast && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* 1. Results View: Vendor Expense Bill */}
        {receiptResult && (
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/20 space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">
                  Scanned Expense Bill Draft
                </span>
                <Badge className="bg-emerald-600 text-white text-[10px]">
                  {Math.round(receiptResult.confidenceScore * 100)}% Confidence
                </Badge>
              </div>

              {/* Strict Non-verified disclaimer badge */}
              <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <ShieldAlert className="w-3 h-3 text-amber-600" />
                <span>Extracted from image — not bank verified</span>
              </div>
            </div>

            {/* Editable Draft Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Bill Title:
                </label>
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Vendor Name:
                </label>
                <input
                  type="text"
                  value={expenseVendor}
                  onChange={(e) => setExpenseVendor(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Amount (₹):
                </label>
                <input
                  type="number"
                  value={expenseAmount || ""}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Category:
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none"
                >
                  <option value="Rent">Rent</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Internet">Internet</option>
                  <option value="Salary/Honorarium">Salary/Honorarium</option>
                  <option value="Materials">Materials</option>
                  <option value="Software">Software</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Line items if extracted */}
            {receiptResult.lineItems && receiptResult.lineItems.length > 0 && (
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] space-y-1">
                <span className="font-semibold text-slate-700 block mb-1">Detected Line Items:</span>
                {receiptResult.lineItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-slate-600">
                    <span>• {item.description}</span>
                    <span className="font-mono">{formatINR(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Confirmation footer */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReceiptResult(null)}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleCreateDraftExpense}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Expense...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Draft Expense Bill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 2. Results View: Student Payment Screenshot */}
        {paymentResult && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 space-y-4 animate-in fade-in duration-300">
            {/* Critical Red/Amber Guardrail Banner */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="block font-bold">
                  Extracted from image — not bank verified.
                </strong>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  FeePulse does not automatically record payments or mark invoices as paid based solely on OCR. Please confirm bank credit, select the student, and proceed to the verified payment drawer.
                </p>
              </div>
            </div>

            {/* Editable Match Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
              {/* Student Matching */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Match Student:
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const custId = e.target.value;
                    setSelectedCustomerId(custId);
                    const inv = invoices.find((i) => i.customerId === custId && i.balanceDue > 0);
                    setSelectedInvoiceId(inv ? inv.id : "");
                  }}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none"
                >
                  <option value="">-- Select Student --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({formatINR(c.outstandingBalance)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Invoice Matching */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Match Invoice:
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none"
                >
                  <option value="">-- Select Invoice --</option>
                  {invoices
                    .filter((i) => !selectedCustomerId || i.customerId === selectedCustomerId)
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} (Bal: {formatINR(inv.balanceDue)})
                      </option>
                    ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Extracted Amount (₹):
                </label>
                <input
                  type="number"
                  value={paymentAmount || ""}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-none"
                />
              </div>

              {/* UTR / Reference */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  UTR / Reference ID:
                </label>
                <input
                  type="text"
                  value={utrRef}
                  onChange={(e) => setUtrRef(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-none"
                />
              </div>
            </div>

            {/* Handoff Button to Verified Payment Flow */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-slate-500">
                Extracted Payer: <strong>{paymentResult.payerName || "Unknown"}</strong> • Mode: {paymentResult.paymentMethod || "UPI"}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentResult(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleProceedToPaymentHandoff}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-xs transition-all"
                >
                  <span>Proceed to Verified Record Payment</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
