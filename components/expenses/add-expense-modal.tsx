"use client";

import React, { useState } from "react";
import { X, Plus, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBillAction } from "@/app/actions/bills";
import { uiCategoryToDb, type BillRecord, type RecurrenceFrequency } from "@/lib/dal/bills";
import { EXPENSE_CATEGORIES } from "@/lib/finance/expense-calculations";

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (bill: BillRecord) => void;
}

export function AddExpenseModal({ isOpen, onClose, onSuccess }: AddExpenseModalProps) {
  const [title, setTitle] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState("Rent");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurrenceFrequency>("monthly");
  const [recurringEndDate, setRecurringEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const parsedAmount = Number(amount) || 0;
    if (parsedAmount <= 0) {
      setErrors({ amount: "Expense amount must be greater than zero." });
      return;
    }
    if (!title.trim()) {
      setErrors({ title: "Expense title is required." });
      return;
    }
    if (!dueDate) {
      setErrors({ dueDate: "Due date is required." });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await createBillAction({
        title: title.trim(),
        vendorName: vendorName.trim() || null,
        category: uiCategoryToDb(category),
        amount: parsedAmount,
        dueDate,
        isRecurring,
        recurringFrequency: isRecurring ? recurringFrequency : null,
        recurringDayOfMonth: isRecurring ? parseInt(dueDate.slice(-2), 10) || 1 : null,
        recurringEndDate: isRecurring && recurringEndDate ? recurringEndDate : null,
        notes: notes.trim() || null,
      });

      if (!res.success) {
        setFormError(res.error);
        if (res.details) {
          const fieldMap: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.details)) {
            fieldMap[k] = v[0] || "Invalid field";
          }
          setErrors(fieldMap);
        }
        setIsSubmitting(false);
        return;
      }

      if (onSuccess) {
        onSuccess(res.data);
      }

      // Reset form
      setTitle("");
      setVendorName("");
      setCategory("Rent");
      setAmount("");
      setDueDate(new Date().toISOString().slice(0, 10));
      setIsRecurring(false);
      setRecurringFrequency("monthly");
      setRecurringEndDate("");
      setNotes("");
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to record bill. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs p-4 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Add Overhead / Bill
              </h3>
              <p className="text-xs text-slate-300">
                Track coaching centre operating expenses & recurrent outlays
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Description / Title */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Expense Title / Description
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Centre Rent, Assistant Tutor Honorarium"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              required
            />
            {errors.title && <p className="text-[10px] text-rose-600">{errors.title}</p>}
          </div>

          {/* Vendor / Payee & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Vendor / Payee
              </label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Apex Realties, Airtel"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
              {errors.vendorName && <p className="text-[10px] text-rose-600">{errors.vendorName}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 font-bold text-xs">₹</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              {errors.amount && <p className="text-[10px] text-rose-600">{errors.amount}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                required
              />
              {errors.dueDate && <p className="text-[10px] text-rose-600">{errors.dueDate}</p>}
            </div>
          </div>

          {/* Recurring Schedule Switch */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Recurring Overhead
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Automatically projected into future cashflow cycles
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                disabled={isSubmitting}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {isRecurring && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 animate-in fade-in duration-150">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    Frequency
                  </label>
                  <select
                    value={recurringFrequency}
                    onChange={(e) => setRecurringFrequency(e.target.value as RecurrenceFrequency)}
                    disabled={isSubmitting}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={recurringEndDate}
                    onChange={(e) => setRecurringEndDate(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                  {errors.recurringEndDate && (
                    <p className="text-[10px] text-rose-600">{errors.recurringEndDate}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Notes & Reminders
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Account details, landlord contact, invoice terms"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Overhead</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
