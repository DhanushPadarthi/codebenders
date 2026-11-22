"use client";

import React, { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/formatters";
import {
  WhatIfScenarioParams,
  CashflowEngineResult,
  simulateWhatIfScenario,
  CashflowEngineInputs,
} from "@/lib/finance/cashflow-engine";
import type { CashflowScenarioRecord } from "@/lib/dal/cashflow";
import { saveScenarioAction, deleteScenarioAction } from "@/app/actions/cashflow";
import {
  SlidersHorizontal,
  RotateCcw,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  DollarSign,
  Clock,
  BookmarkPlus,
  Trash2,
  FolderOpen,
  Loader2,
  Save,
} from "lucide-react";

interface ScenarioSimulatorProps {
  engineInputs: CashflowEngineInputs;
  initialScenarios?: CashflowScenarioRecord[];
  onScenarioChange?: (scenarioResult: CashflowEngineResult | null) => void;
}

export function ScenarioSimulator({
  engineInputs,
  initialScenarios = [],
}: ScenarioSimulatorProps) {
  // Scenario selection state
  const [activePreset, setActivePreset] = useState<
    "none" | "delay_payment" | "overhead_hike" | "early_rent" | "custom_saved"
  >("none");
  const [delayDays, setDelayDays] = useState<number>(15);
  const [overheadPercent, setOverheadPercent] = useState<number>(15);
  const [earlyBillDays, setEarlyBillDays] = useState<number>(5);

  // Saved scenarios state
  const [savedScenarios, setSavedScenarios] = useState<CashflowScenarioRecord[]>(initialScenarios);
  const [customParams, setCustomParams] = useState<WhatIfScenarioParams | null>(null);
  const [isSavingOpen, setIsSavingOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Find candidate student invoice for Scenario A (e.g. largest open balance)
  const openInvoices = engineInputs.invoices.filter((i) => i.balanceDue > 0 && i.status !== "draft");
  const targetInvoice = openInvoices[0] || engineInputs.invoices[0];

  // Find candidate bill for Scenario C (e.g. largest recurring rent/salary bill)
  const openBills = engineInputs.bills.filter((b) => b.status !== "paid");
  const targetBill = openBills.find((b) => b.amount >= 15000) || openBills[0] || engineInputs.bills[0];

  // Construct scenario params
  let currentScenario: WhatIfScenarioParams | undefined = undefined;

  if (activePreset === "delay_payment" && targetInvoice) {
    currentScenario = {
      id: "delay-student-fee",
      name: `Delay ${targetInvoice.customerName}'s Fee (+${delayDays}d)`,
      delayedInvoiceId: targetInvoice.id,
      delayDays: delayDays,
    };
  } else if (activePreset === "overhead_hike") {
    currentScenario = {
      id: "overhead-cost-hike",
      name: `Operating Expenses Increase (+${overheadPercent}%)`,
      overheadIncreasePercent: overheadPercent,
      overheadCategory: "ALL",
    };
  } else if (activePreset === "early_rent" && targetBill) {
    // Pay 5 days earlier than original due date
    const earlyDate = new Date(targetBill.dueDate);
    earlyDate.setDate(earlyDate.getDate() - earlyBillDays);
    const dateStr = earlyDate.toISOString().slice(0, 10);
    currentScenario = {
      id: "early-rent-settlement",
      name: `Pay ${targetBill.title} Early (-${earlyBillDays}d)`,
      earlyBillId: targetBill.id,
      earlyPayDate: dateStr,
    };
  } else if (activePreset === "custom_saved" && customParams) {
    currentScenario = customParams;
  }

  // Calculate comparative simulation
  const simulation = simulateWhatIfScenario(engineInputs, currentScenario || {});
  const { baseResult, scenarioResult, differenceClosingBalance, differenceLowestBalance } = simulation;

  const handleReset = () => {
    setActivePreset("none");
    setDelayDays(15);
    setOverheadPercent(15);
    setEarlyBillDays(5);
    setCustomParams(null);
    setIsSavingOpen(false);
    setFeedbackMsg(null);
  };

  const handleOpenSave = () => {
    if (!currentScenario) return;
    setSaveName(currentScenario.name || "Custom Scenario");
    setSaveDesc(`Simulated with as-of date ${engineInputs.asOfDate}`);
    setIsSavingOpen(true);
  };

  const handleSaveScenario = () => {
    if (!saveName.trim() || !currentScenario) return;

    startTransition(async () => {
      const result = await saveScenarioAction({
        name: saveName.trim(),
        description: saveDesc.trim() || undefined,
        parameters: currentScenario as Record<string, unknown>,
        resultSummary: {
          projectedClosingBalance: scenarioResult.summary.projectedClosingBalance,
          lowestProjectedBalance: scenarioResult.summary.lowestProjectedBalance,
          hasDeficit: scenarioResult.summary.hasDeficit,
          differenceClosingBalance,
          differenceLowestBalance,
        },
      });

      if (result.success) {
        setSavedScenarios((prev) => [result.data, ...prev]);
        setIsSavingOpen(false);
        setFeedbackMsg({ type: "success", text: `Scenario "${saveName}" saved successfully!` });
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setFeedbackMsg({ type: "error", text: result.error });
      }
    });
  };

  const handleDeleteScenario = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      const result = await deleteScenarioAction(id);
      if (result.success) {
        setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
        if (customParams && (customParams as { dbId?: string }).dbId === id) {
          handleReset();
        }
        setFeedbackMsg({ type: "success", text: "Scenario archived successfully." });
        setTimeout(() => setFeedbackMsg(null), 3000);
      } else {
        setFeedbackMsg({ type: "error", text: result.error });
      }
    });
  };

  const handleLoadSavedScenario = (scenario: CashflowScenarioRecord) => {
    const params = {
      ...(scenario.parameters as unknown as WhatIfScenarioParams),
      name: scenario.name,
      dbId: scenario.id,
    };
    setCustomParams(params);
    setActivePreset("custom_saved");
    setIsSavingOpen(false);
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">
              &ldquo;What-If&rdquo; Cashflow Scenario Sandbox
            </CardTitle>
            <Badge variant="outline" className="text-[10px] bg-slate-50 text-indigo-700 border-indigo-200">
              Isolated Simulation
            </Badge>
          </div>
          <CardDescription>
            Simulate payment delays, inflation hikes, or early vendor settlements without modifying financial records.
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          {activePreset !== "none" && currentScenario && !isSavingOpen && (
            <button
              onClick={handleOpenSave}
              disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Save Scenario
            </button>
          )}

          {activePreset !== "none" && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Baseline
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-6">
        {/* Feedback message banner */}
        {feedbackMsg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center justify-between ${
              feedbackMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              onClick={() => setFeedbackMsg(null)}
              className="font-bold text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>
        )}

        {/* Inline Save Form */}
        {isSavingOpen && (
          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <BookmarkPlus className="w-4 h-4 text-indigo-600" />
                Save Scenario to Staging Database
              </span>
              <button
                onClick={() => setIsSavingOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Scenario Name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Q4 Late Fee Buffer"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Description / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  placeholder="e.g. Assumes 15d fee delay"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setIsSavingOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/60 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScenario}
                disabled={isPending || !saveName.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-all disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Confirm &amp; Save
              </button>
            </div>
          </div>
        )}

        {/* Preset Selector Buttons */}
        <div>
          <span className="text-xs font-semibold text-slate-700 block mb-2">
            Select a Scenario to Simulate:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Scenario A */}
            <button
              onClick={() => {
                setActivePreset("delay_payment");
                setCustomParams(null);
              }}
              className={`p-3 text-left rounded-xl border transition-all text-xs flex flex-col justify-between ${
                activePreset === "delay_payment"
                  ? "border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-600"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  Scenario A: Late Student Fee
                </span>
                {activePreset === "delay_payment" && (
                  <Badge className="bg-indigo-600 text-[10px] py-0">Active</Badge>
                )}
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                {targetInvoice
                  ? `Student delays tuition fee payment by ${delayDays} days.`
                  : "No open invoices found. Add an invoice to simulate delay."}
              </p>
            </button>

            {/* Scenario B */}
            <button
              onClick={() => {
                setActivePreset("overhead_hike");
                setCustomParams(null);
              }}
              className={`p-3 text-left rounded-xl border transition-all text-xs flex flex-col justify-between ${
                activePreset === "overhead_hike"
                  ? "border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-600"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                  Scenario B: Overhead Hike
                </span>
                {activePreset === "overhead_hike" && (
                  <Badge className="bg-indigo-600 text-[10px] py-0">Active</Badge>
                )}
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Operating expenses (rent, electricity, tools) rise by {overheadPercent}%.
              </p>
            </button>

            {/* Scenario C */}
            <button
              onClick={() => {
                setActivePreset("early_rent");
                setCustomParams(null);
              }}
              className={`p-3 text-left rounded-xl border transition-all text-xs flex flex-col justify-between ${
                activePreset === "early_rent"
                  ? "border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-600"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1.5">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                  Scenario C: Early Bill Pay
                </span>
                {activePreset === "early_rent" && (
                  <Badge className="bg-indigo-600 text-[10px] py-0">Active</Badge>
                )}
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                {targetBill
                  ? `Settling vendor bill early (-${earlyBillDays} days).`
                  : "No pending bills found. Add a bill to simulate early pay."}
              </p>
            </button>
          </div>
        </div>

        {/* Dynamic Controls based on selected Scenario */}
        {activePreset === "delay_payment" && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            {targetInvoice ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Targeted Invoice: <span className="text-indigo-700">{targetInvoice.customerName}</span> ({targetInvoice.invoiceNumber} • {formatINR(targetInvoice.balanceDue)})
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Delay Period:</span>
                  {[7, 15, 30].map((days) => (
                    <button
                      key={days}
                      onClick={() => setDelayDays(days)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                        delayDays === days
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      +{days} Days
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>No open student invoices are available to delay. Please create an invoice first.</span>
              </div>
            )}
          </div>
        )}

        {activePreset === "overhead_hike" && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Operating Cost Inflation Rate:
              </span>
              <div className="flex items-center gap-2">
                {[5, 10, 15, 25].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setOverheadPercent(pct)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                      overheadPercent === pct
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    +{pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activePreset === "early_rent" && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            {targetBill ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Early Settlement Target: <span className="text-indigo-700">{targetBill.title}</span> ({formatINR(targetBill.amount)})
                </span>
                <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  Due on {targetBill.dueDate} &rarr; Paid {earlyBillDays} days early
                </span>
              </div>
            ) : (
              <div className="text-xs text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>No pending bills found. Please add an operating bill first.</span>
              </div>
            )}
          </div>
        )}

        {/* Saved Scenarios Browser */}
        {savedScenarios.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2.5">
              <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">
                Saved What-If Scenarios ({savedScenarios.length}):
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {savedScenarios.map((sc) => {
                const isCurrent =
                  activePreset === "custom_saved" &&
                  customParams &&
                  (customParams as { dbId?: string }).dbId === sc.id;

                return (
                  <div
                    key={sc.id}
                    onClick={() => handleLoadSavedScenario(sc)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                      isCurrent
                        ? "border-indigo-600 bg-indigo-50/70 shadow-2xs"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 truncate flex items-center gap-1">
                        {sc.name}
                        {isCurrent && <Badge className="bg-indigo-600 text-[9px] py-0">Active</Badge>}
                      </div>
                      {sc.description && (
                        <div className="text-[10px] text-slate-500 truncate">{sc.description}</div>
                      )}
                    </div>
                    <button
                      onClick={(e) => handleDeleteScenario(sc.id, e)}
                      title="Delete Scenario"
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comparative Simulation Results Card */}
        <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {activePreset === "none" ? "Baseline Forecast Overview" : `Simulation Impact: ${currentScenario?.name}`}
            </span>
            {scenarioResult.summary.hasDeficit ? (
              <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Deficit Risk Triggered
              </Badge>
            ) : (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Solvent
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            {/* Baseline Closing */}
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Baseline Closing</span>
              <span className="font-bold text-slate-900 text-sm font-mono">
                {formatINR(baseResult.summary.projectedClosingBalance)}
              </span>
            </div>

            {/* Simulated Closing */}
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Simulated Closing</span>
              <span
                className={`font-bold text-sm font-mono ${
                  scenarioResult.summary.projectedClosingBalance < baseResult.summary.projectedClosingBalance
                    ? "text-rose-600"
                    : "text-slate-900"
                }`}
              >
                {formatINR(scenarioResult.summary.projectedClosingBalance)}
              </span>
              {differenceClosingBalance !== 0 && (
                <span
                  className={`text-[10px] block mt-0.5 font-semibold ${
                    differenceClosingBalance < 0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {differenceClosingBalance < 0 ? "" : "+"}
                  {formatINR(differenceClosingBalance)}
                </span>
              )}
            </div>

            {/* Lowest Balance Point */}
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Lowest Cash Position</span>
              <span
                className={`font-bold text-sm font-mono ${
                  scenarioResult.summary.lowestProjectedBalance < 0
                    ? "text-rose-600"
                    : scenarioResult.summary.lowestProjectedBalance < scenarioResult.summary.safeReserveThreshold
                    ? "text-amber-600"
                    : "text-emerald-600"
                }`}
              >
                {formatINR(scenarioResult.summary.lowestProjectedBalance)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                on {scenarioResult.summary.lowestBalanceDate}
                {differenceLowestBalance !== 0 && (
                  <span className={`ml-1 font-semibold ${differenceLowestBalance < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    ({differenceLowestBalance < 0 ? "" : "+"}{formatINR(differenceLowestBalance)})
                  </span>
                )}
              </span>
            </div>

            {/* Shortage or Buffer Status */}
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-slate-500 block">Buffer Runway Status</span>
              {scenarioResult.summary.hasDeficit ? (
                <span className="font-bold text-rose-600 text-xs block mt-1">
                  Deficit on {scenarioResult.summary.firstDeficitDate}
                </span>
              ) : scenarioResult.summary.lowestProjectedBalance < scenarioResult.summary.safeReserveThreshold ? (
                <span className="font-bold text-amber-600 text-xs block mt-1">
                  Buffer breach (-{formatINR(scenarioResult.summary.safeReserveThreshold - scenarioResult.summary.lowestProjectedBalance)})
                </span>
              ) : (
                <span className="font-bold text-emerald-600 text-xs block mt-1">
                  Healthy (&gt; {formatINR(scenarioResult.summary.safeReserveThreshold)})
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
