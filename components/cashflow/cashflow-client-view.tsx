"use client";

import React, { useState, useMemo } from "react";
import { calculateCashflowForecast } from "@/lib/finance/cashflow-engine";
import { buildEngineInputs, type AggregatedCashflowState } from "@/lib/dal/cashflow";
import { CashflowSummaryCards } from "@/components/cashflow/cashflow-summary-cards";
import { InteractiveCashflowChart } from "@/components/cashflow/interactive-cashflow-chart";
import { ScenarioSimulator } from "@/components/cashflow/scenario-simulator";
import { CashflowBreakdownTable } from "@/components/cashflow/cashflow-breakdown-table";
import { SmartAlertsCard } from "@/components/cashflow/smart-alerts-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  TrendingUp,
  ShieldCheck,
  Info,
  CheckCircle2,
  Calendar,
  AlertTriangle,
} from "lucide-react";

interface CashflowClientViewProps {
  initialData: AggregatedCashflowState;
}

export function CashflowClientView({ initialData }: CashflowClientViewProps) {
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);

  // Rebuild engine inputs when horizon or initial data changes
  const engineInputs = useMemo(() => {
    return buildEngineInputs(
      initialData.openingCashBalance,
      initialData.invoices,
      initialData.bills,
      initialData.customers,
      initialData.promises,
      {
        asOfDate: initialData.asOfDate,
        horizonDays: horizon,
        safeReserveThreshold: 50000,
      }
    );
  }, [initialData, horizon]);

  // Compute live deterministic cashflow projection
  const forecastResult = useMemo(() => {
    return calculateCashflowForecast(engineInputs);
  }, [engineInputs]);

  const { summary, points, alerts, inflowSchedule, outflowSchedule, assumptions } = forecastResult;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              FeePulse Treasury &amp; Runway
            </span>
            <Badge variant="outline" className="text-[10px] bg-slate-50 text-indigo-700 border-indigo-200">
              Module 5
            </Badge>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-600" />
            Cashflow Forecasting &amp; Scenario Simulator
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Deterministic 30, 60, and 90-day cash roll-forward simulations. Computes exact daily positions combining fee cycles, confirmed promises, and fixed overheads.
          </p>
        </div>

        {/* Global Runway Status Pill */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {summary.hasDeficit ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold shadow-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Cash Deficit Warning ({summary.firstDeficitDate})</span>
            </div>
          ) : summary.lowestProjectedBalance < summary.safeReserveThreshold ? (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold shadow-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Reserve Buffer Breach Warning</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Safe Cash Runway: 90+ Days Guaranteed</span>
            </div>
          )}
        </div>
      </div>

      {/* 1. Summary Cards */}
      <CashflowSummaryCards summary={summary} timeframeLabel={`${horizon}D`} />

      {/* 2. Interactive Projection Chart */}
      <InteractiveCashflowChart
        points={points}
        horizon={horizon}
        onHorizonChange={setHorizon}
        safeReserveThreshold={summary.safeReserveThreshold}
        hasDeficit={summary.hasDeficit}
      />

      {/* 3. What-If Scenario Sandbox */}
      <ScenarioSimulator
        engineInputs={engineInputs}
        initialScenarios={initialData.scenarios}
      />

      {/* 4. Smart Financial Guardrails & Warnings */}
      <SmartAlertsCard alerts={alerts} />

      {/* 5. Cashflow Schedule & Line-Item Audit */}
      <CashflowBreakdownTable inflows={inflowSchedule} outflows={outflowSchedule} />

      {/* 6. Deterministic Engine Logic & Assumptions Accordion / Card */}
      <Card className="border-slate-200 bg-slate-50/60 shadow-xs">
        <CardHeader className="py-4 border-b border-slate-200/60">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Deterministic Forecasting Engine Assumptions &amp; Integrity Controls
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-4 text-xs text-slate-600 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {assumptions.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 bg-white p-2.5 rounded-lg border border-slate-200/80">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200/60 text-[11px] text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>Integer paise math guarantees zero IEEE-754 floating point precision drift.</span>
            <span className="flex items-center gap-1 font-mono text-slate-700">
              <Calendar className="w-3 h-3 text-slate-400" />
              Simulation As-Of: {initialData.asOfDate}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
