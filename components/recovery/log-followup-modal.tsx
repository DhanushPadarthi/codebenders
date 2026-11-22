"use client";

import React, { useState } from "react";
import { CustomerRecoveryItem } from "@/lib/finance/recovery-scoring";
import { FollowUpOutcome, FollowUpTone } from "@/lib/sample-data";
import { formatINR } from "@/lib/formatters";
import {
  X,
  ClipboardList,
  CreditCard,
  Save,
  Clock,
  Loader2,
} from "lucide-react";

interface LogFollowUpModalProps {
  item: CustomerRecoveryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveFollowUp: (followUp: {
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
  }) => Promise<void> | void;
  onOpenRecordPayment?: (item: CustomerRecoveryItem) => void;
  isSaving?: boolean;
}

function LogFollowUpModalDialog({
  item,
  onClose,
  onSaveFollowUp,
  onOpenRecordPayment,
  isSaving = false,
}: {
  item: CustomerRecoveryItem;
  onClose: () => void;
  onSaveFollowUp: LogFollowUpModalProps["onSaveFollowUp"];
  onOpenRecordPayment?: LogFollowUpModalProps["onOpenRecordPayment"];
  isSaving?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultNextDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  })();

  const [outcome, setOutcome] = useState<FollowUpOutcome>("contacted");
  const [tone, setTone] = useState<FollowUpTone>(item.recommendedTone);
  const [followUpDate, setFollowUpDate] = useState<string>(today);
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>(defaultNextDate);
  const [notes, setNotes] = useState<string>("");

  // Promise specific fields
  const [promisedAmount, setPromisedAmount] = useState<number>(item.totalOverdueAmount);
  const [promisedDate, setPromisedDate] = useState<string>(defaultNextDate);

  const handleNextDatePreset = (daysToAdd: number) => {
    const base = new Date();
    base.setDate(base.getDate() + daysToAdd);
    setNextFollowUpDate(base.toISOString().slice(0, 10));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (outcome === "payment_received") {
      onClose();
      onOpenRecordPayment?.(item);
      return;
    }

    const primaryInvoice = item.invoices[0];

    await onSaveFollowUp({
      customerId: item.customerId,
      customerName: item.studentName,
      parentName: item.parentName,
      invoiceId: primaryInvoice?.id,
      invoiceNumber: primaryInvoice?.invoiceNumber || item.invoiceNumbers[0],
      followUpDate,
      outcome,
      notes: notes.trim() || `Recorded follow-up: ${outcome.replace("_", " ")}`,
      nextFollowUpDate,
      tone,
      promiseDetails:
        outcome === "promised_payment"
          ? {
              promisedAmount,
              promisedDate,
            }
          : undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Log Follow-Up Activity
              </h3>
              <p className="text-xs text-slate-500">
                Record collection outcome for {item.studentName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Student Overview Strip */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900">{item.studentName}</div>
              <div className="text-slate-500 text-[11px]">{item.parentName} • {item.phone}</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-rose-600">
                {formatINR(item.totalOverdueAmount)}
              </div>
              <div className="text-[11px] text-slate-400">{item.maxOverdueDays}d overdue</div>
            </div>
          </div>

          {/* Outcome Dropdown */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Follow-Up Outcome:</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as FollowUpOutcome)}
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
            >
              <option value="contacted">Contacted (Spoke with Parent)</option>
              <option value="promised_payment">Customer Promised Payment</option>
              <option value="reminder_prepared">Reminder Prepared (Draft Ready)</option>
              <option value="no_response">No Response (Unanswered Call / WhatsApp)</option>
              <option value="extension_requested">Requested Fee Extension</option>
              <option value="payment_received">Payment Received (Direct to Receipt Flow)</option>
            </select>
          </div>

          {/* Special Banner if Payment Received */}
          {outcome === "payment_received" && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Verified Payment Workflow</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                FeePulse strictly enforces that fake payments cannot be created from follow-up notes. Clicking <strong>Proceed to Record Payment</strong> will open the actual payment modal to record the receipt with real receipt generation.
              </p>
            </div>
          )}

          {/* Promise Sub-Form when Customer Promised Payment */}
          {outcome === "promised_payment" && (
            <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-3">
              <div className="font-bold text-purple-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                <span>Payment Promise Details:</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-600 block mb-1">
                    Promised Amount (₹):
                  </label>
                  <input
                    type="number"
                    value={promisedAmount}
                    onChange={(e) => setPromisedAmount(Number(e.target.value))}
                    max={item.totalOverdueAmount}
                    min={1}
                    className="w-full p-2 text-xs bg-white border border-purple-200 rounded-lg focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600 block mb-1">
                    Promised Date:
                  </label>
                  <input
                    type="date"
                    value={promisedDate}
                    onChange={(e) => setPromisedDate(e.target.value)}
                    className="w-full p-2 text-xs bg-white border border-purple-200 rounded-lg focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Follow-up Date and Tone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Follow-Up Date:</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Tone Used:</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as FollowUpTone)}
                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none"
              >
                <option value="friendly">Friendly</option>
                <option value="polite">Polite &amp; Professional</option>
                <option value="firm">Firm &amp; Respectful</option>
              </select>
            </div>
          </div>

          {/* Next Follow-Up Date & Presets */}
          {outcome !== "payment_received" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700">Next Scheduled Follow-Up:</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleNextDatePreset(1)}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNextDatePreset(3)}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                  >
                    +3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNextDatePreset(7)}
                    className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                  >
                    +7 Days
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none font-mono"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Call / Discussion Notes:</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Parent requested 3-day extension due to salary delay. Confirmed UPI transfer by Friday."
              rows={3}
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed text-slate-800"
            />
          </div>

          {/* Footer Actions inside form */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-xs transition-all ${
                outcome === "payment_received"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : outcome === "payment_received" ? (
                <>
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Proceed to Record Payment</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Activity Log</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LogFollowUpModal(props: LogFollowUpModalProps) {
  if (!props.isOpen || !props.item) return null;

  return (
    <LogFollowUpModalDialog
      key={props.item.customerId}
      item={props.item}
      onClose={props.onClose}
      onSaveFollowUp={props.onSaveFollowUp}
      onOpenRecordPayment={props.onOpenRecordPayment}
      isSaving={props.isSaving}
    />
  );
}
