"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseSummaryCards } from "@/components/expenses/expense-summary-cards";
import { ExpenseDirectoryTable } from "@/components/expenses/expense-directory-table";
import { AddExpenseModal } from "@/components/expenses/add-expense-modal";
import { MarkPaidModal } from "@/components/expenses/mark-paid-modal";
import { archiveBillAction } from "@/app/actions/bills";
import type { BillRecord, ExpenseSummaryMetrics } from "@/lib/dal/bills";
import { formatINR } from "@/lib/formatters";

interface ExpensesClientViewProps {
  initialBills: BillRecord[];
  metrics?: ExpenseSummaryMetrics;
}

export function ExpensesClientView({ initialBills, metrics }: ExpensesClientViewProps) {
  const [bills, setBills] = useState<BillRecord[]>(initialBills);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [billToMarkPaid, setBillToMarkPaid] = useState<BillRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleBillPaidSuccess = (paidBill: BillRecord) => {
    setBills((prev) => prev.map((b) => (b.id === paidBill.id ? paidBill : b)));
    showToast(`Settled ${paidBill.title} (${formatINR(paidBill.amount)}) on ${paidBill.paidDate || "today"}.`);
  };

  const handleAddExpenseSuccess = (newBill: BillRecord) => {
    setBills((prev) => [newBill, ...prev]);
    showToast(`Created overhead record: ${newBill.title} (${formatINR(newBill.amount)}) due on ${newBill.dueDate}.`);
  };

  const handleArchiveBill = async (bill: BillRecord) => {
    try {
      const res = await archiveBillAction(bill.id);
      if (res.success) {
        setBills((prev) => prev.filter((b) => b.id !== bill.id));
        showToast(`Archived ${bill.title}. Record preserved in compliance with financial regulations.`);
      } else {
        showToast(`Failed to archive: ${res.error}`);
      }
    } catch (err: unknown) {
      showToast(`Error archiving bill: ${err instanceof Error ? err.message : "Database error"}`);
    }
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
                <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
              </Button>
            </Link>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">Overheads & Outflows</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            Bills & Operational Expenses
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage coaching centre rent, teacher honorariums, utility bills, and recurring operating overheads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddModalOpen(true)}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Expense</span>
          </Button>
        </div>
      </div>

      {/* Feedback Toast */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between shadow-2xs animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Expense KPI Metrics Cards */}
      <ExpenseSummaryCards metrics={metrics} bills={bills} />

      {/* Expense Directory Table */}
      <ExpenseDirectoryTable
        bills={bills}
        onMarkPaid={(b) => setBillToMarkPaid(b)}
        onAddExpenseClick={() => setIsAddModalOpen(true)}
        onArchiveBill={handleArchiveBill}
      />

      {/* Add Expense Modal */}
      <AddExpenseModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddExpenseSuccess}
      />

      {/* Mark Paid Modal */}
      {billToMarkPaid && (
        <MarkPaidModal
          bill={billToMarkPaid}
          onClose={() => setBillToMarkPaid(null)}
          onSuccess={handleBillPaidSuccess}
        />
      )}
    </div>
  );
}
