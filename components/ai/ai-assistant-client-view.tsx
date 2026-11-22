"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { PromiseInterpreterCard } from "@/components/ai/promise-interpreter-card";
import { DocumentScannerCard } from "@/components/ai/document-scanner-card";
import { ReminderGeneratorCard } from "@/components/ai/reminder-generator-card";
import { RecordPaymentDrawer } from "@/components/payments/record-payment-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  MessageSquare,
  ScanLine,
  Send,
  Cpu,
  Info,
  CheckCircle2,
} from "lucide-react";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { PaymentPromiseRecord } from "@/lib/dal/recovery";
import type { BillRecord } from "@/lib/dal/bills";

export interface AiAssistantClientViewProps {
  customers: CustomerRecord[];
  invoices: InvoiceRecord[];
  promises: PaymentPromiseRecord[];
  bills: BillRecord[];
  businessName: string;
  businessPaymentDetails?: string;
}

export function AiAssistantClientView({
  customers,
  invoices,
  promises,
  businessName,
  businessPaymentDetails,
}: AiAssistantClientViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"promise" | "scanner" | "reminder">("promise");

  // Payment drawer state for screenshot handoff
  const [paymentDrawerPrefill, setPaymentDrawerPrefill] = useState<{
    isOpen: boolean;
    customerId?: string;
    invoiceId?: string;
    amount?: number;
    referenceId?: string;
  }>({ isOpen: false });

  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotificationToast(msg);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  const handleProceedToRecordPayment = (prefill: {
    customerId?: string;
    invoiceId?: string;
    amount?: number;
    referenceId?: string;
  }) => {
    setPaymentDrawerPrefill({
      isOpen: true,
      customerId: prefill.customerId,
      invoiceId: prefill.invoiceId,
      amount: prefill.amount,
      referenceId: prefill.referenceId,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {notificationToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom duration-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notificationToast}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              FeePulse Copilot
            </span>
            <Badge variant="outline" className="text-[10px] bg-slate-50 text-indigo-700 border-indigo-200">
              PostgreSQL Connected • Groq AI
            </Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            AI Assistant &amp; Document Scanner
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Multimodal financial assistant parsing parent WhatsApp payment promises, vendor bills, and UPI screenshots with verified Groq text and vision models.
          </p>
        </div>

        {/* Model Status Pill */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-semibold shadow-xs">
            <Cpu className="w-4 h-4 text-purple-600 shrink-0" />
            <span>openai/gpt-oss-120b &amp; qwen/qwen3.8-27b</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 w-full max-w-xl">
        <button
          type="button"
          onClick={() => setActiveTab("promise")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "promise"
              ? "bg-white text-purple-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>1. Promise Interpreter</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scanner")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "scanner"
              ? "bg-white text-blue-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span>2. Document Scanner</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("reminder")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-xl transition-all ${
            activeTab === "reminder"
              ? "bg-white text-emerald-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>3. Reminder Generator</span>
        </button>
      </div>

      {/* Active Tab Component */}
      {activeTab === "promise" && (
        <PromiseInterpreterCard
          customers={customers}
          invoices={invoices}
          onPromiseConfirmed={(p) => {
            showToast(
              `Payment promise of ₹${p.promisedAmount.toLocaleString("en-IN")} confirmed for ${p.promisedDate}!`
            );
            router.refresh();
          }}
        />
      )}

      {activeTab === "scanner" && (
        <DocumentScannerCard
          customers={customers}
          invoices={invoices}
          onProceedToRecordPayment={handleProceedToRecordPayment}
          onExpenseCreated={(bill) => {
            showToast(
              `Draft bill "${bill.title}" (₹${bill.amount.toLocaleString("en-IN")}) added to expenses!`
            );
            router.refresh();
          }}
        />
      )}

      {activeTab === "reminder" && (
        <ReminderGeneratorCard
          customers={customers}
          invoices={invoices}
          promises={promises}
          businessName={businessName}
          businessPaymentDetails={businessPaymentDetails}
          onFollowUpLogged={() => {
            router.refresh();
          }}
        />
      )}

      {/* AI Guardrails & Integrity Notice */}
      <Card className="border-slate-200 bg-slate-50/70 shadow-xs">
        <CardHeader className="py-4 border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
              FeePulse Zero-Hallucination Guardrails &amp; Security Protocol
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-4 text-xs text-slate-600 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">1. Factual Commitment Only</strong>
              <p className="text-[11px] text-slate-500">
                AI never invents missing amounts or guesses ambiguous dates. Incomplete promises require explicit clarification.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">2. OCR is Not Bank Verification</strong>
              <p className="text-[11px] text-slate-500">
                Payment screenshots are never marked as paid automatically. They lead to the verified Record Payment flow with user confirmation.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">3. Zero Server Secret Leakage</strong>
              <p className="text-[11px] text-slate-500">
                GROQ_API_KEY remains strictly server-side in Next.js Route Handlers with Zod input validation and rate limiting.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Record Payment Drawer Handoff from Screenshot */}
      {paymentDrawerPrefill.isOpen && (
        <RecordPaymentDrawer
          isOpen={paymentDrawerPrefill.isOpen}
          onClose={() => setPaymentDrawerPrefill({ isOpen: false })}
          customers={customers}
          invoices={invoices}
          preselectedCustomerId={paymentDrawerPrefill.customerId}
          preselectedInvoiceId={paymentDrawerPrefill.invoiceId}
          onPaymentSuccess={(p) => {
            setPaymentDrawerPrefill({ isOpen: false });
            showToast(
              `Verified payment of ₹${p.amount.toLocaleString("en-IN")} recorded with receipt ${p.receiptNumber}!`
            );
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
