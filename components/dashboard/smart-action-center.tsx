"use client";

import React, { useState, useMemo } from "react";
import {
  Zap,
  PhoneCall,
  ArrowRight,
  CheckCircle,
  MessageSquare,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import {
  SmartActionItem,
  SampleInvoice,
  SampleCustomer,
  SamplePaymentPromise,
  RecoveryFollowUp,
  SampleInvoiceStatus,
  FollowUpTone,
} from "@/lib/sample-data";
import { useRecoveryQueue } from "@/lib/invoice-context";
import { buildRecoveryQueue } from "@/lib/finance/recovery-scoring";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { PaymentPromiseRecord } from "@/lib/dal/recovery";
import type { FollowUpTaskRecord } from "@/lib/dal/recovery";
import type { BillRecord } from "@/lib/dal/bills";

export interface SmartActionCenterProps {
  customers?: CustomerRecord[];
  invoices?: InvoiceRecord[];
  promises?: PaymentPromiseRecord[];
  followUps?: FollowUpTaskRecord[];
  bills?: BillRecord[];
}

export function SmartActionCenter(props: SmartActionCenterProps) {
  const router = useRouter();
  const fallbackContext = useRecoveryQueue();
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [activeMessage, setActiveMessage] = useState<string | null>(null);

  const hasProps = props.customers !== undefined;

  // Adapt customers
  const customers: SampleCustomer[] = useMemo(() => {
    if (!hasProps) return fallbackContext.customers;
    return (props.customers ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      parentName: c.parentName || "—",
      gradeSubject: c.gradeSubject || "General",
      email: c.email || undefined,
      phone: c.phone,
      whatsappNumber: c.whatsappNumber,
      defaultFeeAmount: c.defaultFeeAmount,
      billingCycleDay: c.billingCycleDay,
      status: c.status,
      notes: c.notes,
      totalInvoiced: c.totalInvoiced,
      totalCollected: c.totalCollected,
      outstandingBalance: c.outstandingBalance,
      nextPaymentDate: c.nextPaymentDate || new Date().toISOString().slice(0, 10),
      overdueCount: c.overdueCount,
      joinedDate: c.joinedDate,
    }));
  }, [hasProps, props.customers, fallbackContext.customers]);

  // Adapt invoices
  const invoices: SampleInvoice[] = useMemo(() => {
    if (!hasProps) return fallbackContext.invoices;
    return (props.invoices ?? []).map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      customerName: inv.customerName,
      customerGrade: inv.customerGrade,
      parentName: inv.parentName || "—",
      parentPhone: inv.parentPhone || "—",
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      subtotal: inv.subtotal,
      discount: inv.discount,
      totalAmount: inv.totalAmount,
      amountPaid: inv.amountPaid,
      balanceDue: inv.balanceDue,
      status: ((inv.effectiveStatus || inv.status) as SampleInvoiceStatus) || "sent",
      paymentTerms: "Due on receipt",
      notes: inv.notes,
      items: (inv.items || []).map((it) => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
      })),
    }));
  }, [hasProps, props.invoices, fallbackContext.invoices]);

  // Adapt promises
  const promises: SamplePaymentPromise[] = useMemo(() => {
    if (!hasProps) return fallbackContext.promises;
    return (props.promises ?? []).map((p) => ({
      id: p.id,
      customerId: p.customerId,
      invoiceId: p.invoiceId,
      rawMessage: p.rawMessage,
      promisedAmount: p.promisedAmount,
      promisedDate: p.promisedDate,
      status: p.status,
      confidenceScore: p.confidenceScore,
    }));
  }, [hasProps, props.promises, fallbackContext.promises]);

  // Adapt followUps
  const followUps: RecoveryFollowUp[] = useMemo(() => {
    if (!hasProps) return fallbackContext.followUps;
    return (props.followUps ?? []).map((t) => {
      const cust = (props.customers ?? []).find((c) => c.id === t.customerId);
      const inv = (props.invoices ?? []).find((i) => i.id === t.invoiceId);
      return {
        id: t.id,
        customerId: t.customerId,
        customerName: cust?.name || "Student",
        parentName: cust?.parentName || "Parent",
        invoiceId: t.invoiceId,
        invoiceNumber: inv?.invoiceNumber,
        followUpDate: t.dueDate || new Date().toISOString().slice(0, 10),
        tone: (t.tone as FollowUpTone) || "friendly",
        notes: t.notes || "",
        outcome: t.outcome,
        recordedAt: t.createdAt || new Date().toISOString(),
      };
    });
  }, [hasProps, props.followUps, props.customers, props.invoices, fallbackContext.followUps]);

  // Compute live recovery queue items to dynamically populate actions
  const recoveryItems = useMemo(() => {
    return buildRecoveryQueue(customers, invoices, promises, followUps);
  }, [customers, invoices, promises, followUps]);

  const rawBills = useMemo(() => props.bills ?? [], [props.bills]);

  // Dynamically assemble unified smart actions
  const dynamicActions: SmartActionItem[] = useMemo(() => {
    const actions: SmartActionItem[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Top recovery queue items (only if overdue balance > 0)
    recoveryItems
      .filter((item) => item.totalOverdueAmount > 0)
      .slice(0, 2)
      .forEach((item) => {
        const isBroken = item.activePromise?.status === "broken";
        const isDueToday =
          item.activePromise?.status === "pending" &&
          item.activePromise.promisedDate <= todayStr;

        actions.push({
          id: `act-rec-${item.customerId}`,
          type: isDueToday ? "promise_due" : "overdue_followup",
          urgency: isBroken ? "urgent" : isDueToday ? "action_required" : "urgent",
          title: `${item.studentName} (${item.gradeSubject})`,
          description: isBroken
            ? `₹${item.totalOverdueAmount.toLocaleString("en-IN")} overdue by ${item.maxOverdueDays} days. Broken promise from ${item.activePromise?.promisedDate}. Parent: ${item.parentName}.`
            : isDueToday
            ? `Promised fee payment of ₹${item.totalOverdueAmount.toLocaleString("en-IN")} is due today (${item.studentName}). Stated method: UPI / Cash.`
            : `₹${item.totalOverdueAmount.toLocaleString("en-IN")} overdue by ${item.maxOverdueDays} days. Recommendation: ${item.recommendedAction}.`,
          amount: item.totalOverdueAmount,
          studentName: item.studentName,
          parentPhone: item.whatsappNumber || item.phone,
          dueDate: item.oldestOverdueDueDate,
          primaryActionLabel: isDueToday ? "Review in Recovery Queue" : "Send WhatsApp Reminder",
          secondaryActionLabel: "View Invoices",
        });
      });

    // 2. Nearest upcoming unpaid overhead bill from real bills
    const unpaidBills = rawBills
      .filter((b) => b.status !== "paid")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (unpaidBills.length > 0) {
      const nextBill = unpaidBills[0];
      const isOverdue = nextBill.status === "overdue" || nextBill.dueDate < todayStr;
      actions.push({
        id: `act-bill-${nextBill.id}`,
        type: "upcoming_bill",
        urgency: isOverdue ? "urgent" : "scheduled",
        title: `${nextBill.title} (${nextBill.category})`,
        description: `₹${nextBill.amount.toLocaleString("en-IN")} due on ${formatDate(nextBill.dueDate, "short")}. Vendor: ${nextBill.vendorName || "Operational"}.`,
        amount: nextBill.amount,
        dueDate: nextBill.dueDate,
        primaryActionLabel: "Review Bill Details",
        secondaryActionLabel: "View Expenses",
      });
    }

    // 3. Draft invoices ready for dispatch
    const draftInvoices = (props.invoices ?? []).filter((inv) => inv.status === "draft");
    if (draftInvoices.length > 0) {
      const draftTotal = draftInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      actions.push({
        id: "act-draft-invoices",
        type: "batch_generation",
        urgency: "action_required",
        title: `${draftInvoices.length} Draft Invoices Ready`,
        description: `${draftInvoices.length} student fee invoice(s) totaling ₹${draftTotal.toLocaleString("en-IN")} are drafted and ready to issue.`,
        amount: draftTotal,
        dueDate: todayStr,
        primaryActionLabel: "Review Invoices",
        secondaryActionLabel: "View Invoices",
      });
    }

    return actions;
  }, [recoveryItems, rawBills, props.invoices]);

  const handleAction = (id: string, message: string, route?: string) => {
    setActiveMessage(message);
    setTimeout(() => {
      setCompletedActions((prev) => [...prev, id]);
      setActiveMessage(null);
      if (route) {
        router.push(route);
      }
    }, 800);
  };

  const visibleActions = dynamicActions.filter(
    (act) => !completedActions.includes(act.id)
  );

  return (
    <Card className="border-slate-200/90 shadow-sm overflow-hidden bg-white">
      <CardHeader className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white p-5 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
              <Zap className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                Smart Action Centre
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Priority Queue
                </span>
              </CardTitle>
              <CardDescription className="text-slate-300 text-xs">
                Time-sensitive collection tasks &amp; critical cashflow actions for today.
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/recovery-queue"
              className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline underline-offset-4 transition-colors"
            >
              Open Recovery Queue →
            </Link>
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-semibold">
              {visibleActions.length} Actions
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-3">
        {activeMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{activeMessage}</span>
          </div>
        )}

        {visibleActions.length === 0 ? (
          <div className="text-center py-8 text-slate-500 space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-900">All caught up!</p>
            <p className="text-xs text-slate-500">
              No pending cashflow alerts or overdue follow-ups requiring immediate action.
            </p>
          </div>
        ) : (
          visibleActions.map((action) => {
            const isUrgent = action.urgency === "urgent";
            const isPromise = action.type === "promise_due";
            const isBill = action.type === "upcoming_bill";
            const isBatch = action.type === "batch_generation";

            return (
              <div
                key={action.id}
                className={cn(
                  "p-4 rounded-xl border transition-all hover:shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                  isUrgent && "bg-rose-50/40 border-rose-200/80",
                  isPromise && "bg-amber-50/40 border-amber-200/80",
                  isBill && "bg-slate-50/80 border-slate-200/80",
                  isBatch && "bg-indigo-50/40 border-indigo-200/80"
                )}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isUrgent && (
                      <Badge variant="danger" className="text-[10px]">
                        Overdue Warning
                      </Badge>
                    )}
                    {isPromise && (
                      <Badge variant="warning" className="text-[10px]">
                        Promise Due Today
                      </Badge>
                    )}
                    {isBill && (
                      <Badge variant="secondary" className="text-[10px]">
                        Upcoming Outflow
                      </Badge>
                    )}
                    {isBatch && (
                      <Badge variant="info" className="text-[10px]">
                        Fee Cycle Ready
                      </Badge>
                    )}

                    <h4 className="font-bold text-sm text-slate-900 truncate">
                      {action.title}
                    </h4>

                    {action.amount && (
                      <span className="font-mono font-bold text-xs text-slate-800 bg-white px-2 py-0.5 rounded-lg border border-slate-200 tabular-nums">
                        {formatINR(action.amount)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {action.description}
                  </p>

                  {action.parentPhone && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                      <PhoneCall className="w-3 h-3 text-slate-400" />
                      <span>Parent: {action.parentPhone}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {action.secondaryActionLabel && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs bg-white text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        const target =
                          action.type === "upcoming_bill" ? "/expenses" : "/invoices";
                        router.push(target);
                      }}
                    >
                      {action.secondaryActionLabel}
                    </Button>
                  )}

                  <Button
                    variant={isUrgent ? "danger" : "default"}
                    size="sm"
                    className="text-xs gap-1.5 font-semibold"
                    onClick={() => {
                      if (
                        action.type === "overdue_followup" ||
                        action.type === "promise_due"
                      ) {
                        handleAction(
                          action.id,
                          `Routing to Recovery Queue for ${action.title}...`,
                          "/recovery-queue"
                        );
                      } else if (action.type === "upcoming_bill") {
                        handleAction(
                          action.id,
                          `Reviewing bills...`,
                          "/expenses"
                        );
                      } else {
                        handleAction(
                          action.id,
                          `Action performed: "${action.primaryActionLabel}" for ${action.title}`,
                          "/invoices"
                        );
                      }
                    }}
                  >
                    {isUrgent && <MessageSquare className="w-3.5 h-3.5" />}
                    <span>{action.primaryActionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
