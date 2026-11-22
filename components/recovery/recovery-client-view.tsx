"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecoveryQueueData } from "@/lib/dal/recovery";
import type { CustomerRecoveryItem } from "@/lib/finance/recovery-scoring";
import { FollowUpOutcome, FollowUpTone } from "@/lib/sample-data";
import type { PaymentRecord } from "@/lib/dal/payments";
import {
  createFollowUpTaskAction,
  createPaymentPromiseAction,
} from "@/app/actions/recovery";
import { RecoveryKpiCards } from "@/components/recovery/recovery-kpi-cards";
import { RecoverySmartActions } from "@/components/recovery/recovery-smart-actions";
import { RecoveryCustomerTable } from "@/components/recovery/recovery-customer-table";
import { PaymentReminderModal } from "@/components/recovery/payment-reminder-modal";
import { LogFollowUpModal } from "@/components/recovery/log-followup-modal";
import { RecordPaymentDrawer } from "@/components/payments/record-payment-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  ListTodo,
  ShieldCheck,
  CheckCircle2,
  Info,
  Calendar,
  AlertTriangle,
} from "lucide-react";

interface RecoveryClientViewProps {
  initialData: RecoveryQueueData;
}

export function RecoveryClientView({ initialData }: RecoveryClientViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modals & drawers
  const [reminderItem, setReminderItem] = useState<CustomerRecoveryItem | null>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);

  const [followUpItem, setFollowUpItem] = useState<CustomerRecoveryItem | null>(null);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);

  const [paymentItem, setPaymentItem] = useState<CustomerRecoveryItem | null>(null);
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);

  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const { items, stats, customers, invoices, businessProfile, asOfDate } = initialData;

  const handleOpenReminder = (item: CustomerRecoveryItem) => {
    setReminderItem(item);
    setIsReminderOpen(true);
  };

  const handleOpenFollowUp = (item: CustomerRecoveryItem) => {
    setFollowUpItem(item);
    setIsFollowUpOpen(true);
  };

  const handleOpenRecordPayment = (item: CustomerRecoveryItem) => {
    setPaymentItem(item);
    setIsPaymentDrawerOpen(true);
  };

  const handleSaveFollowUp = async (data: {
    customerId: string;
    customerName: string;
    parentName: string;
    invoiceId?: string;
    invoiceNumber?: string;
    followUpDate: string;
    outcome: FollowUpOutcome;
    notes: string;
    nextFollowUpDate?: string;
    tone?: FollowUpTone;
    promiseDetails?: {
      promisedAmount: number;
      promisedDate: string;
    };
  }) => {
    startTransition(async () => {
      // 1. Create Follow-Up Task in PostgreSQL
      const fupResult = await createFollowUpTaskAction({
        customerId: data.customerId,
        invoiceId: data.invoiceId,
        outcome: data.outcome,
        notes: data.notes,
        dueDate: data.nextFollowUpDate,
        tone: data.tone,
        contactedAt: data.followUpDate,
        status: data.outcome === "no_response" ? "dismissed" : "completed",
      });

      if (!fupResult.success) {
        showToast(`Error saving follow-up: ${fupResult.error}`);
        return;
      }

      // 2. If customer made a payment promise, save to payment_promises table
      if (data.promiseDetails) {
        const prmResult = await createPaymentPromiseAction({
          customerId: data.customerId,
          invoiceId: data.invoiceId,
          rawMessage: `Promised via follow-up on ${data.followUpDate}: ${data.notes}`,
          promisedAmount: data.promiseDetails.promisedAmount,
          promisedDate: data.promiseDetails.promisedDate,
          status: "pending",
          confidenceScore: 0.85,
        });

        if (prmResult.success) {
          showToast(
            `Follow-up logged & payment promise of ₹${data.promiseDetails.promisedAmount.toLocaleString("en-IN")} recorded for ${data.promiseDetails.promisedDate}!`
          );
        } else {
          showToast(`Follow-up saved, but promise record failed: ${prmResult.error}`);
        }
      } else {
        showToast("Follow-up communication logged successfully in database!");
      }

      router.refresh();
    });
  };

  const handlePaymentSuccess = (payment: PaymentRecord) => {
    setIsPaymentDrawerOpen(false);
    showToast(
      `Payment of ₹${payment.amount.toLocaleString("en-IN")} recorded! Receipt ${payment.receiptNumber} generated.`
    );
    router.refresh();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom duration-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              FeePulse Collections
            </span>
            <Badge variant="outline" className="text-[10px] bg-slate-50 text-indigo-700 border-indigo-200">
              Module 6
            </Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-indigo-600" />
            Smart Recovery Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Prioritized collection queue ranking overdue student fees by overdue duration, broken promises, and historical follow-up responses. Zero AI math hallucination.
          </p>
        </div>

        {/* Global Collection Rate Banner */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {stats.brokenPromisesCount > 0 ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold shadow-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{stats.brokenPromisesCount} Broken Payment Promise Action Required</span>
            </div>
          ) : items.length > 0 ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Healthy Recovery Pipeline: Active Follow-Ups</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>All Fees Current: Zero Overdue Invoices</span>
            </div>
          )}
        </div>
      </div>

      {/* 1. Recovery Headline KPI Cards */}
      <RecoveryKpiCards stats={stats} />

      {/* 2. Top Urgent Action Cards */}
      <RecoverySmartActions
        items={items}
        onOpenReminder={handleOpenReminder}
        onOpenFollowUp={handleOpenFollowUp}
        onOpenRecordPayment={handleOpenRecordPayment}
      />

      {/* 3. Overdue Student Directory Table */}
      <RecoveryCustomerTable
        items={items}
        onOpenReminder={handleOpenReminder}
        onOpenFollowUp={handleOpenFollowUp}
        onOpenRecordPayment={handleOpenRecordPayment}
      />

      {/* 4. Priority Scoring Methodology & Explainability Card */}
      <Card className="border-slate-200 bg-slate-50/70 shadow-xs">
        <CardHeader className="py-4 border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Deterministic Priority Scoring Formula &amp; Integrity Controls
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-4 text-xs text-slate-600 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">1. Overdue Duration</strong>
              <p className="text-[11px] text-slate-500">
                Graduated scale: +10 (&le;3d), +20 (4-7d), +35 (8-14d), +45 (14-20d), +55 (&gt;20d).
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">2. Outstanding Balance</strong>
              <p className="text-[11px] text-slate-500">
                +25 (&ge; ₹10k), +15 (₹5k - ₹10k), +5 (&lt; ₹5k). High balances prioritize cash runway.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">3. Promise Factor</strong>
              <p className="text-[11px] text-slate-500">
                Broken promises add +35 immediate penalty; pending future promises grant a -25 grace discount.
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <strong className="text-slate-900 block mb-1">4. Recency &amp; Response</strong>
              <p className="text-[11px] text-slate-500">
                Contacted today grants -15; unanswered follow-ups escalate +5 each (max +15).
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>Customer-level aggregation strictly guarantees zero duplicate counting of multi-invoice students.</span>
            <span className="flex items-center gap-1 font-mono text-slate-700">
              <Calendar className="w-3 h-3 text-slate-400" />
              As-Of Evaluation Date: {asOfDate}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 5. Modals & Drawers */}
      <PaymentReminderModal
        item={reminderItem}
        isOpen={isReminderOpen}
        onClose={() => setIsReminderOpen(false)}
        businessName={businessProfile.businessName}
        ownerName={businessProfile.ownerName}
        upiId={businessProfile.upiId}
        onOpenFollowUp={handleOpenFollowUp}
      />

      <LogFollowUpModal
        item={followUpItem}
        isOpen={isFollowUpOpen}
        onClose={() => setIsFollowUpOpen(false)}
        onSaveFollowUp={handleSaveFollowUp}
        onOpenRecordPayment={handleOpenRecordPayment}
        isSaving={isPending}
      />

      {paymentItem && (
        <RecordPaymentDrawer
          isOpen={isPaymentDrawerOpen}
          onClose={() => setIsPaymentDrawerOpen(false)}
          customers={customers}
          invoices={invoices}
          preselectedCustomerId={paymentItem.customerId}
          preselectedInvoiceId={paymentItem.invoices[0]?.id}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
