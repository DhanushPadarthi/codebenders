"use client";

import React, { useState } from "react";
import {
  CustomerRecoveryItem,
  generateReminderDrafts,
  buildWhatsAppUrl,
  ReminderDrafts,
} from "@/lib/finance/recovery-scoring";
import { formatINR } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Copy,
  Check,
  Send,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";

interface PaymentReminderModalProps {
  item: CustomerRecoveryItem | null;
  isOpen: boolean;
  onClose: () => void;
  businessName?: string;
  ownerName?: string;
  upiId?: string;
  onOpenFollowUp?: (item: CustomerRecoveryItem) => void;
}

function PaymentReminderModalDialog({
  item,
  onClose,
  businessName,
  ownerName,
  upiId,
  onOpenFollowUp,
}: {
  item: CustomerRecoveryItem;
  onClose: () => void;
  businessName?: string;
  ownerName?: string;
  upiId?: string;
  onOpenFollowUp?: (item: CustomerRecoveryItem) => void;
}) {
  const [selectedTone, setSelectedTone] = useState<"friendly" | "polite" | "firm">(
    item.recommendedTone
  );

  const drafts: ReminderDrafts = generateReminderDrafts(
    item,
    businessName || "FeePulse Academy",
    ownerName || "Tutor",
    upiId || "fees@upi"
  );

  const [customText, setCustomText] = useState<string>(() => drafts[item.recommendedTone]);
  const [copied, setCopied] = useState<boolean>(false);

  const handleToneChange = (tone: "friendly" | "polite" | "firm") => {
    setSelectedTone(tone);
    setCustomText(drafts[tone]);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(customText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenWhatsApp = () => {
    const url = buildWhatsAppUrl(item.whatsappNumber || item.phone, customText);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleProceedToFollowUp = () => {
    onClose();
    onOpenFollowUp?.(item);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Payment Reminder Generator
              </h3>
              <p className="text-xs text-slate-500">
                Prepared draft for {item.studentName} ({item.parentName})
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

        {/* Content body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Quick Recipient Info Strip */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-slate-500">Student: </span>
              <strong className="text-slate-800">{item.studentName}</strong>
              <span className="text-slate-400 mx-1.5">•</span>
              <span className="text-slate-500">Parent: </span>
              <strong className="text-slate-800">{item.parentName}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-rose-600 font-mono font-bold">
                {formatINR(item.totalOverdueAmount)} Overdue
              </span>
              <Badge variant="outline" className="text-[10px] bg-white">
                {item.maxOverdueDays}d Past Due
              </Badge>
            </div>
          </div>

          {/* Tone Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Communication Tone:
              </label>
              {item.recommendedTone === selectedTone && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                  <Sparkles className="w-3 h-3" />
                  Recommended Tone
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleToneChange("friendly")}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all ${
                  selectedTone === "friendly"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Friendly
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  1-5 Days Overdue
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleToneChange("polite")}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all ${
                  selectedTone === "polite"
                    ? "bg-indigo-50 text-indigo-800 border-indigo-300 ring-1 ring-indigo-300"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Polite &amp; Professional
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  6-12 Days Overdue
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleToneChange("firm")}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all ${
                  selectedTone === "firm"
                    ? "bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-300"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Firm &amp; Respectful
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  13+ Days / Broken
                </span>
              </button>
            </div>
          </div>

          {/* Editable Draft Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                Message Preview &amp; Customization:
              </label>
              <span className="text-[11px] text-slate-400">
                Target WhatsApp: {item.whatsappNumber || item.phone}
              </span>
            </div>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={8}
              className="w-full p-3.5 text-xs text-slate-800 font-sans border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed bg-white shadow-2xs"
            />
          </div>

          {/* Verification Guardrail Notice */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              <strong>Verified Delivery Protocol:</strong> Opening WhatsApp launches your messaging client with this verified text. To keep your recovery pipeline accurate, use <strong>Log Follow-Up</strong> once you have contacted the parent.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {onOpenFollowUp && (
              <button
                type="button"
                onClick={handleProceedToFollowUp}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Log Follow-Up</span>
              </button>
            )}

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
                  <span>Copy Message</span>
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
    </div>
  );
}

export function PaymentReminderModal(props: PaymentReminderModalProps) {
  if (!props.isOpen || !props.item) return null;

  return (
    <PaymentReminderModalDialog
      key={props.item.customerId}
      item={props.item}
      onClose={props.onClose}
      businessName={props.businessName}
      ownerName={props.ownerName}
      upiId={props.upiId}
      onOpenFollowUp={props.onOpenFollowUp}
    />
  );
}
