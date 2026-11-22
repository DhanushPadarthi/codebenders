'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Receipt,
  PiggyBank,
  Save,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  QrCode,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { updateSettingsAction } from '@/app/actions/settings';
import type { BusinessEntity, BusinessSettingsEntity } from '@/lib/auth/get-business-context';
import { formatINR } from '@/lib/formatters';

interface SettingsClientViewProps {
  initialBusiness: BusinessEntity | null;
  initialSettings: BusinessSettingsEntity | null;
  userEmail: string;
}

export function SettingsClientView({
  initialBusiness,
  initialSettings,
  userEmail,
}: SettingsClientViewProps) {
  const router = useRouter();

  const [academyName, setAcademyName] = useState(initialBusiness?.name || 'My Tuition Academy');
  const [openingCashBalance, setOpeningCashBalance] = useState<number>(
    initialSettings?.opening_cash_balance ?? 0
  );
  const [defaultPaymentTermsDays, setDefaultPaymentTermsDays] = useState<number>(
    initialSettings?.default_payment_terms_days ?? 7
  );
  const [upiId, setUpiId] = useState(initialSettings?.upi_id || '');
  const [invoicePrefix, setInvoicePrefix] = useState(initialSettings?.invoice_prefix || 'INV-');
  const [monthlyBurnTarget, setMonthlyBurnTarget] = useState<number>(
    initialSettings?.monthly_burn_target ?? 0
  );

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: Record<string, string[]>;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const res = await updateSettingsAction({
        academyName: academyName.trim(),
        openingCashBalance: Number(openingCashBalance),
        defaultPaymentTermsDays: Number(defaultPaymentTermsDays),
        upiId: upiId.trim() ? upiId.trim() : null,
        invoicePrefix: invoicePrefix.trim(),
        monthlyBurnTarget: Number(monthlyBurnTarget),
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Settings updated successfully. Changes are now active across invoices, billing, and cashflow projections.',
        });
        router.refresh();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to update settings.',
          details: res.details,
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'An unexpected error occurred while saving settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 gap-1 font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
              </Button>
            </Link>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">Preferences</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            Academy &amp; Financial Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure tuition center identity, payment terms, dynamic UPI billing, and working capital thresholds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold py-1 px-3 flex items-center gap-1.5 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            PostgreSQL RLS Protected
          </Badge>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-sm font-medium flex flex-col gap-1.5 shadow-2xs animate-in slide-in-from-top-2 duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-bold">{feedback.message}</span>
          </div>
          {feedback.details && (
            <ul className="list-disc list-inside text-xs mt-1 space-y-0.5 text-rose-800 font-medium">
              {Object.entries(feedback.details).map(([field, msgs]) => (
                <li key={field}>
                  <strong className="capitalize">{field}</strong>: {msgs.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Academy Profile */}
        <Card className="border-slate-200/90 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Tuition Academy Profile</CardTitle>
                <CardDescription className="mt-0.5">
                  Your business identity displayed on fee slips, invoices, and communication.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Academy / Coaching Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={academyName}
                  onChange={(e) => setAcademyName(e.target.value)}
                  placeholder="e.g. Sharma Coaching Classes"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 transition-all font-medium text-slate-900"
                />
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  Shown in the sidebar and header of all parent statements.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Owner Email
                </label>
                <input
                  type="email"
                  disabled
                  value={userEmail}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-100/70 text-slate-500 cursor-not-allowed font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  Authenticated Supabase account tied to this business workspace.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Base Currency
                </label>
                <div className="px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-semibold flex items-center justify-between">
                  <span>Indian Rupee (INR)</span>
                  <Badge variant="outline" className="text-xs font-bold">₹</Badge>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Timezone
                </label>
                <div className="px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-semibold">
                  Asia/Kolkata (IST • UTC+05:30)
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Invoicing & Billing Defaults */}
        <Card className="border-slate-200/90 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Invoicing &amp; Digital Payments</CardTitle>
                <CardDescription className="mt-0.5">
                  Default numbering formats and payment identifiers for student billings.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Invoice Number Prefix <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                  placeholder="INV-"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 uppercase font-mono font-bold text-slate-900 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  Prefix prepended to generated invoice numbers (e.g. {invoicePrefix}1001).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Default Payment Terms (Days) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  required
                  value={defaultPaymentTermsDays}
                  onChange={(e) => setDefaultPaymentTermsDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold text-slate-900 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  Days after issue date before a student fee invoice turns overdue.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-slate-500" />
                  UPI ID (VPA) for Parent Payments
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. sharma@okhdfcbank"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono font-semibold text-slate-900 transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  Embedded into WhatsApp fee reminders and dynamic UPI QR payment slips.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Cashflow & Working Capital Thresholds */}
        <Card className="border-slate-200/90 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                <PiggyBank className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Cashflow &amp; Reserve Benchmarks</CardTitle>
                <CardDescription className="mt-0.5">
                  Configure baseline liquidity and minimum cash buffer for smart deficit alerts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Opening Cash Balance (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={openingCashBalance}
                    onChange={(e) => setOpeningCashBalance(Number(e.target.value))}
                    className="w-full pl-8 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono font-bold text-slate-900 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  Current cash on hand and in bank ledger ({formatINR(openingCashBalance)}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Monthly Reserve Target / Buffer (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={monthlyBurnTarget}
                    onChange={(e) => setMonthlyBurnTarget(Number(e.target.value))}
                    className="w-full pl-8 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono font-bold text-slate-900 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  Threshold ({formatINR(monthlyBurnTarget)}) below which FeePulse triggers a cash deficit warning.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-6 py-2.5 h-10 gap-2 shadow-xs cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Preferences...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Settings</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
