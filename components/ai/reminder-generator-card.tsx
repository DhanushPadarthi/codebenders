"use client";

import React, { useState } from "react";
import { useFeePulse } from "@/lib/invoice-context";
import { buildWhatsAppUrl } from "@/lib/finance/recovery-scoring";
import { formatINR } from "@/lib/formatters";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ClipboardList,
} from "lucide-react";
import { createFollowUpTaskAction } from "@/app/actions/recovery";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { PaymentPromiseRecord } from "@/lib/dal/recovery";

export interface ReminderGeneratorCardProps {
  businessName?: string;
  businessPaymentDetails?: string;
  customers?: CustomerRecord[];
  invoices?: InvoiceRecord[];
  promises?: PaymentPromiseRecord[];
  onFollowUpLogged?: () => void;
}

export function ReminderGeneratorCard({
  businessName,
  businessPaymentDetails,
  customers: propCustomers,
  invoices: propInvoices,
  promises: propPromises,
  onFollowUpLogged,
}: ReminderGeneratorCardProps) {
  const context = useFeePulse();
  const customers = propCustomers ?? (context.customers as unknown as CustomerRecord[]);
  const invoices = propInvoices ?? (context.invoices as unknown as InvoiceRecord[]);
  const promises = propPromises ?? (context.promises as unknown as PaymentPromiseRecord[]);

  // Find customers with pending balance
  const overdueCustomers = customers.filter((c) => c.outstandingBalance > 0);
  const defaultCust = overdueCustomers[0] || customers[0];

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(defaultCust?.id || "");
  const [tone, setTone] = useState<"friendly" | "polite" | "firm">("polite");
  const [generatedText, setGeneratedText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingFollowUp, setIsLoggingFollowUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const currentCustomer = customers.find((c) => c.id === selectedCustomerId) || defaultCust;

  const currentInvoices = invoices.filter(
    (i) =>
      (i.customerId === currentCustomer?.id ||
        (i.customerName &&
          currentCustomer?.name &&
          i.customerName.toLowerCase() === currentCustomer.name.toLowerCase())) &&
      i.balanceDue > 0
  );

  const activePromise = promises.find(
    (p) =>
      p.customerId === currentCustomer?.id && (p.status === "pending" || p.status === "broken")
  );

  const handleGenerate = async () => {
    if (!currentCustomer) return;

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessToast(null);
    setCopied(false);

    try {
      const res = await fetch("/api/ai/generate-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName: currentCustomer.parentName || currentCustomer.name,
          studentName: currentCustomer.name,
          outstandingBalance: currentCustomer.outstandingBalance,
          invoiceNumbers: currentInvoices.map((i) => i.invoiceNumber),
          overdueDays: currentInvoices[0]?.overdueDays || 7,
          promiseStatus: activePromise
            ? `Promise ${activePromise.status} (date: ${activePromise.promisedDate})`
            : undefined,
          tone,
          businessPaymentDetails: businessPaymentDetails || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.message || "Failed to generate reminder");
      }

      setGeneratedText(json.data.message);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedText) return;
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    if (!generatedText || !currentCustomer) return;
    const phone = currentCustomer.whatsappNumber || currentCustomer.phone;
    const url = buildWhatsAppUrl(phone, generatedText);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleLogFollowUp = async () => {
    if (!currentCustomer) return;
    setIsLoggingFollowUp(true);
    setErrorMsg(null);

    try {
      const today = new Date().toISOString().split("T")[0];
      const result = await createFollowUpTaskAction({
        customerId: currentCustomer.id,
        invoiceId: currentInvoices[0]?.id || undefined,
        dueDate: today,
        priorityLevel: "medium",
        tone: tone,
        outcome: "contacted",
        notes: `AI reminder drafted and reviewed via WhatsApp (${tone} tone)`,
      });

      if (!result.success) {
        setErrorMsg(result.error || "Failed to log follow-up contact.");
        return;
      }

      setSuccessToast(`Follow-up contact logged for ${currentCustomer.name}.`);
      onFollowUpLogged?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log follow-up contact.");
    } finally {
      setIsLoggingFollowUp(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                AI Payment Reminder Generator
              </CardTitle>
              <CardDescription>
                Draft tone-calibrated WhatsApp fee reminders with context from invoices, promises, and past outcomes.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-slate-50 text-emerald-800 border-emerald-200 self-start sm:self-auto">
            openai/gpt-oss-120b
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5 text-xs">
        {/* Customer & Tone Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Target Student */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Target Student &amp; Invoice:</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setGeneratedText("");
                setErrorMsg(null);
              }}
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — Parent: {c.parentName || "Parent"} ({formatINR(c.outstandingBalance)} pending)
                </option>
              ))}
            </select>
          </div>

          {/* Tone Selector */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Communication Tone:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTone("friendly")}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all ${
                  tone === "friendly"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Friendly
              </button>
              <button
                type="button"
                onClick={() => setTone("polite")}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all ${
                  tone === "polite"
                    ? "bg-indigo-50 text-indigo-800 border-indigo-300 ring-1 ring-indigo-300"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Polite &amp; Pro
              </button>
              <button
                type="button"
                onClick={() => setTone("firm")}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all ${
                  tone === "firm"
                    ? "bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-300"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Firm &amp; Urgent
              </button>
            </div>
          </div>
        </div>

        {/* Selected Context Strip */}
        {currentCustomer && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-slate-500">Parent: </span>
              <strong>{currentCustomer.parentName || "Parent"}</strong>
              <span className="text-slate-400 mx-1.5">•</span>
              <span className="text-slate-500">Student: </span>
              <strong>{currentCustomer.name}</strong> {currentCustomer.gradeSubject ? `(${currentCustomer.gradeSubject})` : ""}
              {businessName && (
                <>
                  <span className="text-slate-400 mx-1.5">•</span>
                  <span className="text-slate-500">Academy: </span>
                  <span className="font-semibold text-slate-700">{businessName}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-rose-600">
                {formatINR(currentCustomer.outstandingBalance)} Outstanding
              </span>
              {activePromise && (
                <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                  Promise: {activePromise.status} ({activePromise.promisedDate})
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading || !currentCustomer}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating Reminder...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{generatedText ? "Regenerate Draft" : "Generate with Groq AI"}</span>
              </>
            )}
          </button>
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
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Draft Output Textarea */}
        {generatedText && (
          <div className="space-y-3 pt-2 border-t border-slate-100 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-800">
                Generated Message Draft (Editable):
              </label>
              <span className="text-[11px] text-slate-400">
                Target: {currentCustomer?.whatsappNumber || currentCustomer?.phone || "No phone"} ({generatedText.length} chars)
              </span>
            </div>

            <textarea
              value={generatedText}
              onChange={(e) => setGeneratedText(e.target.value)}
              rows={7}
              className="w-full p-3.5 text-xs text-slate-800 font-sans border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed bg-white shadow-2xs"
            />

            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Zero Phantom Side-Effects:</strong> Copying or opening in WhatsApp communicates externally without modifying database balances. Use <em>Log Follow-up</em> if you wish to track this contact attempt in the Recovery Queue.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleLogFollowUp}
                disabled={isLoggingFollowUp}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl shadow-2xs transition-all disabled:opacity-50"
              >
                {isLoggingFollowUp ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Logging...</span>
                  </>
                ) : (
                  <>
                    <ClipboardList className="w-3.5 h-3.5 text-slate-600" />
                    <span>Log Follow-up Contact</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-2xs transition-all"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Open in WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
