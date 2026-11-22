"use client";

import React from "react";
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
import { CashflowForecastPoint } from "@/lib/finance/cashflow-engine";
import { ShieldCheck, AlertCircle } from "lucide-react";

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

function CustomForecastTooltip({ active, payload, label, points }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const point = points.find((p) => p.displayDate === label || p.date === label);

    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md p-3.5 shadow-xl text-xs max-w-sm z-50">
        <div className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-2 flex items-center justify-between">
          <span>{point?.displayDate || label} ({point?.date})</span>
          {point?.milestoneDescription && (
            <span className="text-[10px] font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              Key Event
            </span>
          )}
        </div>

        {point?.milestoneDescription && (
          <p className="text-[11px] text-slate-700 italic mb-2 pb-1.5 border-b border-slate-100 font-medium">
            &ldquo;{point.milestoneDescription}&rdquo;
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
              <span className={`font-semibold font-mono ${
                entry.dataKey === "projectedBalance"
                  ? entry.value < 0
                    ? "text-rose-600"
                    : "text-indigo-700"
                  : entry.dataKey === "expectedInflows"
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}>
                {formatINR(entry.value)}
              </span>
            </div>
          ))}
        </div>

        {/* Breakdown details */}
        {point && (point.inflowItems.length > 0 || point.outflowItems.length > 0) && (
          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[10px] text-slate-500 space-y-1">
            {point.inflowItems.map((item) => (
              <div key={item.id} className="flex justify-between text-emerald-700">
                <span className="truncate pr-2">• {item.title}</span>
                <span className="font-mono shrink-0">+{formatINR(item.amount)}</span>
              </div>
            ))}
            {point.outflowItems.map((item) => (
              <div key={item.id} className="flex justify-between text-rose-700">
                <span className="truncate pr-2">• {item.title}</span>
                <span className="font-mono shrink-0">-{formatINR(item.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
}

interface InteractiveCashflowChartProps {
  points: CashflowForecastPoint[];
  horizon: 30 | 60 | 90;
  onHorizonChange: (h: 30 | 60 | 90) => void;
  safeReserveThreshold?: number;
  hasDeficit?: boolean;
}

export function InteractiveCashflowChart({
  points,
  horizon,
  onHorizonChange,
  safeReserveThreshold = 50000,
  hasDeficit = false,
}: InteractiveCashflowChartProps) {
  // Sample periodic points to prevent overcrowded chart ticks on 60/90 days
  const filteredPoints = points.filter((_, idx) => {
    if (horizon === 30) return true; // show all 30 days
    if (horizon === 60) return idx % 2 === 0; // every 2nd day
    return idx % 3 === 0; // every 3rd day
  });

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-bold text-slate-900">
              Deterministic Cashflow Projection ({horizon}-Day Horizon)
            </CardTitle>
            <Badge
              variant="outline"
              className="text-[10px] bg-slate-50 text-slate-600 border-slate-200"
            >
              Exact Paise Arithmetic
            </Badge>
          </div>
          <CardDescription>
            Daily roll-forward combining student receivables, confirmed promises, and fixed overhead schedules.
          </CardDescription>
        </div>

        {/* Horizon Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto border border-slate-200/60">
          <button
            onClick={() => onHorizonChange(30)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              horizon === 30
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => onHorizonChange(60)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              horizon === 60
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            60 Days
          </button>
          <button
            onClick={() => onHorizonChange(90)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              horizon === 90
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            90 Days
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* Chart View */}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={filteredPoints}
              margin={{ top: 12, right: 12, left: -8, bottom: 0 }}
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
              <Tooltip
                content={<CustomForecastTooltip points={points} />}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: 16, fontSize: 12 }}
              />

              {/* Safe reserve threshold line */}
              <ReferenceLine
                y={safeReserveThreshold}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: `Buffer Threshold (₹${safeReserveThreshold / 1000}k)`,
                  position: "insideTopLeft",
                  fill: "#d97706",
                  fontSize: 10,
                }}
              />

              {/* Zero deficit line */}
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />

              {/* Daily Inflows */}
              <Bar
                name="Expected Inflows"
                dataKey="expectedInflows"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={horizon === 30 ? 20 : 12}
              />

              {/* Daily Outflows */}
              <Bar
                name="Upcoming Expenses"
                dataKey="upcomingExpenses"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                maxBarSize={horizon === 30 ? 20 : 12}
              />

              {/* Projected Balance Line */}
              <Line
                name="Projected Balance"
                type="monotone"
                dataKey="projectedBalance"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{ r: horizon === 30 ? 3 : 2, fill: "#4f46e5", strokeWidth: 1.5, stroke: "#ffffff" }}
                activeDot={{ r: 5, fill: "#4f46e5" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Footer explanation */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            {hasDeficit ? (
              <span className="inline-flex items-center text-rose-600 font-medium">
                <AlertCircle className="w-4 h-4 mr-1 shrink-0" />
                Deficit alert: Cash balance projected to dip below zero within {horizon} days.
              </span>
            ) : (
              <span className="inline-flex items-center text-emerald-600 font-medium">
                <ShieldCheck className="w-4 h-4 mr-1 shrink-0" />
                Runway Healthy: Minimum buffer remains above ₹{safeReserveThreshold.toLocaleString("en-IN")}.
              </span>
            )}
          </div>
          <span className="text-slate-400">Pure TypeScript • Zero Floating Drift</span>
        </div>
      </CardContent>
    </Card>
  );
}
