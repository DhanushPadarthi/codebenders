"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/formatters";
import { useCashflow } from "@/lib/invoice-context";
import { calculateCashflowForecast, CashflowForecastPoint } from "@/lib/finance/cashflow-engine";
import { buildEngineInputs } from "@/lib/dal/cashflow";
import { LineChart as LineChartIcon, ShieldCheck, AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { BillRecord } from "@/lib/dal/bills";
import type { CustomerRecord } from "@/lib/dal/customers";
import type { PaymentPromiseRecord } from "@/lib/dal/recovery";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
  points: CashflowForecastPoint[];
}

function CustomTooltip({ active, payload, label, points }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const dataPoint = points.find((p) => p.displayDate === label || p.date === label);

    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md p-3.5 shadow-xl text-xs max-w-xs z-50">
        <div className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-2 flex items-center justify-between">
          <span>{label}</span>
          {dataPoint?.milestoneDescription && (
            <span className="text-[10px] font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              Event
            </span>
          )}
        </div>

        {dataPoint?.milestoneDescription && (
          <p className="text-[11px] text-slate-600 italic mb-2 pb-1.5 border-b border-slate-100">
            &ldquo;{dataPoint.milestoneDescription}&rdquo;
          </p>
        )}

        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}:
              </span>
              <span
                className={`font-semibold font-mono ${
                  entry.dataKey === "projectedBalance"
                    ? entry.value < 0
                      ? "text-rose-600"
                      : "text-indigo-700"
                    : entry.dataKey === "expectedInflows"
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {formatINR(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export interface CashflowForecastChartProps {
  invoices?: InvoiceRecord[];
  bills?: BillRecord[];
  customers?: CustomerRecord[];
  promises?: PaymentPromiseRecord[];
  openingCashBalance?: number;
  safeReserveThreshold?: number;
}

export function CashflowForecastChart(props: CashflowForecastChartProps) {
  const [timeframe, setTimeframe] = useState<"30" | "60" | "90">("30");
  const fallbackContext = useCashflow();

  const horizonDays = timeframe === "30" ? 30 : timeframe === "60" ? 60 : 90;
  const safeReserveThreshold = props.safeReserveThreshold ?? 50000;

  // Run deterministic cashflow forecasting
  const forecastResult = useMemo(() => {
    if (props.invoices !== undefined) {
      const inputs = buildEngineInputs(
        props.openingCashBalance ?? 0,
        props.invoices ?? [],
        props.bills ?? [],
        props.customers ?? [],
        props.promises ?? [],
        { horizonDays, safeReserveThreshold }
      );
      return calculateCashflowForecast(inputs);
    }

    return calculateCashflowForecast({
      openingCashBalance: 65000,
      invoices: fallbackContext.invoices,
      bills: fallbackContext.bills,
      customers: fallbackContext.customers,
      promises: fallbackContext.promises,
      horizonDays,
      safeReserveThreshold,
    });
  }, [
    props.invoices,
    props.bills,
    props.customers,
    props.promises,
    props.openingCashBalance,
    fallbackContext.invoices,
    fallbackContext.bills,
    fallbackContext.customers,
    fallbackContext.promises,
    horizonDays,
    safeReserveThreshold,
  ]);

  const { summary, points } = forecastResult;

  // Filter display points for 60/90 to keep labels clean
  const displayPoints = points.filter((_, idx) => {
    if (horizonDays === 30) return true;
    if (horizonDays === 60) return idx % 2 === 0;
    return idx % 3 === 0;
  });

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <LineChartIcon className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">
              Cashflow Projection &amp; Runway ({timeframe}-Day Roll-Forward)
            </CardTitle>
            <Badge
              variant="secondary"
              className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              Live State Engine
            </Badge>
          </div>
          <CardDescription>
            Deterministic projection combining fee collection cycles, confirmed payment promises, and fixed overheads.
          </CardDescription>
        </div>

        {/* View toggles & link to full sandbox */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto border border-slate-200/60">
            <button
              onClick={() => setTimeframe("30")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                timeframe === "30"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setTimeframe("60")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                timeframe === "60"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              60 Days
            </button>
            <button
              onClick={() => setTimeframe("90")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                timeframe === "90"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              90 Days
            </button>
          </div>

          <Link
            href="/cashflow"
            className="hidden sm:inline-flex px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all"
          >
            Open Sandbox →
          </Link>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* Metric summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 p-3 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
          <div>
            <span className="text-slate-500 block">Current Balance</span>
            <span className="font-bold text-slate-900 text-sm font-mono">
              {formatINR(summary.openingBalance)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">{timeframe}D Expected Inflows</span>
            <span className="font-bold text-emerald-600 text-sm font-mono">
              +{formatINR(summary.totalInflows)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">{timeframe}D Scheduled Expenses</span>
            <span className="font-bold text-rose-600 text-sm font-mono">
              -{formatINR(summary.totalOutflows)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Projected Closing</span>
            <span
              className={`font-bold text-sm font-mono ${
                summary.projectedClosingBalance < 0 ? "text-rose-600" : "text-indigo-700"
              }`}
            >
              {formatINR(summary.projectedClosingBalance)}
            </span>
          </div>
        </div>

        {/* Recharts Forecast Graph */}
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={displayPoints}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
              />
              <Tooltip content={<CustomTooltip points={points} />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: 16, fontSize: 12 }}
              />

              <ReferenceLine
                y={summary.safeReserveThreshold}
                stroke="#f59e0b"
                strokeDasharray="3 3"
              />

              <Bar
                name="Expected Inflows"
                dataKey="expectedInflows"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={timeframe === "30" ? 24 : 14}
              />
              <Bar
                name="Upcoming Expenses"
                dataKey="upcomingExpenses"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                maxBarSize={timeframe === "30" ? 24 : 14}
              />
              <Line
                name="Projected Balance"
                type="monotone"
                dataKey="projectedBalance"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{
                  r: timeframe === "30" ? 3 : 2,
                  fill: "#4f46e5",
                  strokeWidth: 1.5,
                  stroke: "#ffffff",
                }}
                activeDot={{ r: 5, fill: "#4f46e5" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Bottom indicator */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            {summary.hasDeficit ? (
              <span className="inline-flex items-center text-rose-600 font-medium">
                <AlertTriangle className="w-4 h-4 mr-1 text-rose-500" />
                Deficit warning: Balance projected below zero on {summary.firstDeficitDate}.
              </span>
            ) : summary.lowestProjectedBalance < summary.safeReserveThreshold ? (
              <span className="inline-flex items-center text-amber-600 font-medium">
                <AlertTriangle className="w-4 h-4 mr-1 text-amber-500" />
                Dips below buffer to {formatINR(summary.lowestProjectedBalance)} on{" "}
                {summary.lowestBalanceDate}.
              </span>
            ) : (
              <span className="inline-flex items-center text-emerald-600 font-medium">
                <ShieldCheck className="w-4 h-4 mr-1 text-emerald-500" />
                Zero Cash Shock Alert: Buffer remains healthy (&gt;{" "}
                {formatINR(summary.safeReserveThreshold)}) through all {timeframe} days.
              </span>
            )}
          </div>
          <span className="text-slate-400">Deterministic Engine • Integer Paise</span>
        </div>
      </CardContent>
    </Card>
  );
}
