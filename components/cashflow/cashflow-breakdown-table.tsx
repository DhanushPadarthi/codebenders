"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/formatters";
import { CashflowScheduleItem } from "@/lib/finance/cashflow-engine";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  CheckCircle2,
  HelpCircle,
  Calendar,
} from "lucide-react";

interface CashflowBreakdownTableProps {
  inflows: CashflowScheduleItem[];
  outflows: CashflowScheduleItem[];
}

export function CashflowBreakdownTable({ inflows, outflows }: CashflowBreakdownTableProps) {
  const [activeTab, setActiveTab] = useState<"inflows" | "outflows">("inflows");
  const [searchQuery, setSearchQuery] = useState("");

  const currentItems = activeTab === "inflows" ? inflows : outflows;

  const filteredItems = currentItems.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.date.includes(q)
    );
  });

  const totalInflowsAmount = inflows.reduce((s, i) => s + i.amount, 0);
  const totalOutflowsAmount = outflows.reduce((s, i) => s + i.amount, 0);

  const getTypeBadge = (type: CashflowScheduleItem["type"]) => {
    switch (type) {
      case "payment_promise":
        return (
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-medium">
            Payment Promise
          </Badge>
        );
      case "confirmed_receivable":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-medium">
            Open Receivable
          </Badge>
        );
      case "projected_tuition_cycle":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-medium">
            Projected Tuition
          </Badge>
        );
      case "recurring_overhead":
        return (
          <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-medium">
            Recurring Overhead
          </Badge>
        );
      case "bill_outflow":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-medium">
            Vendor Bill
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-100">
        <div className="space-y-1">
          <CardTitle className="text-base font-bold text-slate-900">
            Cashflow Schedule &amp; Line-Item Audit
          </CardTitle>
          <CardDescription>
            Examine every scheduled inflow and outflow contributing to the daily cash position.
          </CardDescription>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/60 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("inflows")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "inflows"
                ? "bg-white text-emerald-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Expected Inflows ({inflows.length})
          </button>
          <button
            onClick={() => setActiveTab("outflows")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "outflows"
                ? "bg-white text-rose-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Scheduled Outflows ({outflows.length})
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Search bar & Totals bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={`Filter ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div className="text-xs font-semibold text-slate-600">
            Total {activeTab === "inflows" ? "Inflows" : "Outflows"}:{" "}
            <span
              className={`font-mono text-sm ${
                activeTab === "inflows" ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {activeTab === "inflows"
                ? `+${formatINR(totalInflowsAmount)}`
                : `-${formatINR(totalOutflowsAmount)}`}
            </span>
          </div>
        </div>

        {/* Schedule Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3.5">Date</th>
                <th className="py-2.5 px-3.5">Description</th>
                <th className="py-2.5 px-3.5">Category</th>
                <th className="py-2.5 px-3.5">Source Type</th>
                <th className="py-2.5 px-3.5">Confidence</th>
                <th className="py-2.5 px-3.5 text-right">Scheduled Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    No scheduled items found matching your filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Date */}
                    <td className="py-2.5 px-3.5 font-mono text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.date}</span>
                      </div>
                    </td>

                    {/* Description */}
                    <td className="py-2.5 px-3.5">
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      {item.notes && (
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {item.notes}
                        </div>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600">
                      {item.category}
                    </td>

                    {/* Type badge */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {getTypeBadge(item.type)}
                    </td>

                    {/* Confidence */}
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                        {item.confidence >= 0.9 ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <HelpCircle className="w-3 h-3 text-amber-500" />
                        )}
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </td>

                    {/* Amount */}
                    <td
                      className={`py-2.5 px-3.5 font-mono font-bold text-right whitespace-nowrap ${
                        activeTab === "inflows" ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {activeTab === "inflows" ? "+" : "-"}
                      {formatINR(item.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
