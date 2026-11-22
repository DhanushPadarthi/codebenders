"use client";

import React, { useState } from "react";
import { useFeePulse } from "@/lib/invoice-context";
import { PaymentPromiseResult } from "@/lib/ai/groq-client";
import { formatINR } from "@/lib/formatters";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Save,
  Loader2,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { createPaymentPromiseAction } from "@/app/actions/recovery";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { PaymentPromiseRecord } from "@/lib/dal/recovery";

export interface PromiseInterpreterCardProps {
  customers?: CustomerRecord[];
  invoices?: InvoiceRecord[];
  onPromiseConfirmed?: (promise: PaymentPromiseRecord) => void;
}

export function PromiseInterpreterCard({
  customers: propCustomers,
  invoices: propInvoices,
  onPromiseConfirmed,
}: PromiseInterpreterCardProps) {
  // Fallback to in-memory context only if props not provided
  const context = useFeePulse();
  const customers = propCustomers ?? (context.customers as unknown as CustomerRecord[]);
  const invoices = propInvoices ?? (context.invoices as unknown as InvoiceRecord[]);

  const [messageText, setMessageText] = useState("");
  const [referenceDate, setReferenceDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extractedData, setExtractedData] = useState<PaymentPromiseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Editable confirmation form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>("");

  const sampleMessages = [
    {
      label: "Salary Delay",
      text: "Papa will transfer fee on 15th once salary is credited",
    },
    {
      label: "GPay Part Balance",
      text: "Will send remaining 6k by Saturday 7pm through GPay",
    },
    {
      label: "Vague Promise (Triggers Warning)",
      text: "I will try to pay soon maybe next week after uncle arrives",
    },
  ];

  const handleInterpret = async () => {
    if (!messageText.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessToast(null);

    try {
      const res = await fetch("/api/ai/parse-payment-promise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageText: messageText.trim(),
          referenceDate,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.message || "Failed to parse message");
      }

      const data: PaymentPromiseResult = json.data;
      setExtractedData(data);

      // Pre-fill editable fields
      setEditAmount(data.promisedAmount || 0);
      setEditDate(data.promisedDate || referenceDate);

      // Attempt matching student by name if extracted
      if (data.studentName || data.parentName) {
        const query = (data.studentName || data.parentName || "").toLowerCase();
        const matchedCust = customers.find((c) => {
          const cName = (c.name || "").toLowerCase();
          const pName = (c.parentName || "").toLowerCase();
          return cName.includes(query) || pName.includes(query);
        });

        if (matchedCust) {
          setSelectedCustomerId(matchedCust.id);
          const matchedInv = invoices.find(
            (i) => i.customerId === matchedCust.id && i.balanceDue > 0
          );
          if (matchedInv) setSelectedInvoiceId(matchedInv.id);
        }
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPromise = async () => {
    if (!selectedCustomerId) {
      setErrorMsg("Please select the matching student before saving.");
      return;
    }

    if (editAmount <= 0) {
      setErrorMsg("Promised amount must be greater than zero.");
      return;
    }

    if (!editDate) {
      setErrorMsg("Please provide a valid promised date.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const result = await createPaymentPromiseAction({
        customerId: selectedCustomerId,
        invoiceId: selectedInvoiceId || undefined,
        rawMessage: messageText.trim(),
        promisedAmount: editAmount,
        promisedDate: editDate,
        confidenceScore: extractedData?.confidenceScore ?? 0.85,
        status: "pending",
      });

      if (!result.success) {
        setErrorMsg(result.error || "Failed to create payment promise.");
        return;
      }

      onPromiseConfirmed?.(result.data);

      setSuccessToast(
        `Payment promise of ₹${editAmount.toLocaleString("en-IN")} confirmed for ${editDate}!`
      );
      setExtractedData(null);
      setMessageText("");
      setSelectedCustomerId("");
      setSelectedInvoiceId("");
      setEditAmount(0);
      setEditDate("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Payment Promise Interpreter
              </CardTitle>
              <CardDescription>
                Paste unstructured parent WhatsApp messages to extract committed amounts and callback dates with Groq reasoning.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-slate-50 text-purple-800 border-purple-200 self-start sm:self-auto">
            openai/gpt-oss-120b
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5 text-xs">
        {/* Sample Snippets */}
        <div>
          <span className="text-[11px] font-semibold text-slate-600 block mb-1.5">
            Load Sample Parent Message:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sampleMessages.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setMessageText(sample.text)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-medium transition-colors"
              >
                &ldquo;{sample.label}&rdquo;
              </button>
            ))}
          </div>
        </div>

        {/* Input Textarea & Reference Date */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="font-semibold text-slate-800">
              Parent WhatsApp Message:
            </label>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>Reference As-Of Date:</span>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="p-1 border border-slate-200 rounded text-slate-800 font-mono text-[11px] bg-white"
              />
            </div>
          </div>

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="e.g. Papa will transfer fee of 8.5k on 15th once salary is credited to HDFC account..."
            rows={3}
            className="w-full p-3 text-xs text-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white shadow-2xs leading-relaxed"
          />

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {messageText.length}/2000 characters
            </span>
            <button
              type="button"
              onClick={handleInterpret}
              disabled={isLoading || !messageText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-all"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Interpreting Message...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Interpret Message</span>
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

        {/* Extracted Results & Human Confirmation Form */}
        {extractedData && (
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/30 space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-purple-100">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">
                  AI Extracted Commitment Draft
                </span>
                <Badge className={`text-[10px] ${
                  extractedData.confidenceScore >= 0.8
                    ? "bg-emerald-600 text-white"
                    : extractedData.confidenceScore >= 0.6
                    ? "bg-amber-600 text-white"
                    : "bg-rose-600 text-white"
                }`}>
                  {Math.round(extractedData.confidenceScore * 100)}% Confidence
                </Badge>
              </div>
              <span className="text-[11px] text-slate-500 italic">
                &ldquo;{extractedData.summary}&rdquo;
              </span>
            </div>

            {/* Clarification Warning Banner if fields missing */}
            {extractedData.needsClarification && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Clarification Required:</strong>
                  <span className="text-[11px]">{extractedData.clarificationReason || "Some details require tutor confirmation."}</span>
                </div>
              </div>
            )}

            {/* Editable Confirmation Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
              {/* Student Matching */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Matched Student:
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

              {/* Invoice Reference */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Relevant Invoice:
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none"
                >
                  <option value="">-- Optional Invoice --</option>
                  {invoices
                    .filter((i) => !selectedCustomerId || i.customerId === selectedCustomerId)
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} ({formatINR(inv.balanceDue)})
                      </option>
                    ))}
                </select>
              </div>

              {/* Promised Amount */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Promised Amount (₹):
                </label>
                <input
                  type="number"
                  value={editAmount || ""}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-none"
                />
              </div>

              {/* Promised Date */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Promised Date:
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg font-mono focus:outline-none"
                />
              </div>
            </div>

            {/* Human Confirmation Guardrail Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                <span>Explicit Tutor Confirmation Required • Never Recorded as Payment</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExtractedData(null)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPromise}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Promise...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Add Payment Promise</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
