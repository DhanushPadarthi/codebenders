"use client";

import React, { useState } from "react";
import { CustomerRecoveryItem, buildWhatsAppUrl } from "@/lib/finance/recovery-scoring";
import { formatINR } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Search,
  Send,
  PhoneCall,
  CreditCard,
  Clock,
  ShieldAlert,
  CalendarCheck,
  ExternalLink,
} from "lucide-react";

interface RecoveryCustomerTableProps {
  items: CustomerRecoveryItem[];
  onOpenReminder: (item: CustomerRecoveryItem) => void;
  onOpenFollowUp: (item: CustomerRecoveryItem) => void;
  onOpenRecordPayment: (item: CustomerRecoveryItem) => void;
}

export function RecoveryCustomerTable({
  items,
  onOpenReminder,
  onOpenFollowUp,
  onOpenRecordPayment,
}: RecoveryCustomerTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [promiseFilter, setPromiseFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"priority" | "amount" | "days" | "name">("priority");

  // Filtering
  const filtered = items.filter((item) => {
    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = item.studentName.toLowerCase().includes(q);
      const matchParent = item.parentName.toLowerCase().includes(q);
      const matchInvoice = item.invoiceNumbers.some((inv) => inv.toLowerCase().includes(q));
      if (!matchName && !matchParent && !matchInvoice) return false;
    }

    // Priority category
    if (priorityFilter !== "ALL" && item.priorityCategory !== priorityFilter) {
      return false;
    }

    // Promise filter
    const todayStr = new Date().toISOString().slice(0, 10);
    if (promiseFilter === "BROKEN" && item.activePromise?.status !== "broken") {
      return false;
    }
    if (promiseFilter === "DUE_TODAY") {
      const isDueToday = item.activePromise?.status === "pending" && item.activePromise.promisedDate === todayStr;
      if (!isDueToday) return false;
    }
    if (promiseFilter === "NO_PROMISE" && item.activePromise) {
      return false;
    }

    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "priority") {
      return b.priorityScore - a.priorityScore;
    }
    if (sortBy === "amount") {
      return b.totalOverdueAmount - a.totalOverdueAmount;
    }
    if (sortBy === "days") {
      return b.maxOverdueDays - a.maxOverdueDays;
    }
    if (sortBy === "name") {
      return a.studentName.localeCompare(b.studentName);
    }
    return 0;
  });

  const getPriorityBadge = (category: CustomerRecoveryItem["priorityCategory"]) => {
    switch (category) {
      case "Urgent":
        return <Badge className="bg-rose-600 text-white text-[10px] font-bold">Urgent</Badge>;
      case "High":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-semibold">High</Badge>;
      case "Medium":
        return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] font-medium">Medium</Badge>;
      case "Low":
      default:
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-medium">Low</Badge>;
    }
  };

  const getPromiseBadge = (item: CustomerRecoveryItem) => {
    if (!item.activePromise) {
      return <span className="text-[11px] text-slate-400">None</span>;
    }

    if (item.activePromise.status === "broken") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
          <ShieldAlert className="w-3 h-3 text-rose-600" />
          Broken ({item.activePromise.promisedDate})
        </span>
      );
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (item.activePromise.status === "pending" && item.activePromise.promisedDate === todayStr) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
          <CalendarCheck className="w-3 h-3 text-amber-600" />
          Due Today
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
        <Clock className="w-3 h-3 text-slate-400" />
        Due {item.activePromise.promisedDate}
      </span>
    );
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-100">
        <div className="space-y-1">
          <CardTitle className="text-base font-bold text-slate-900">
            Overdue Student Directory &amp; Recovery Ranking
          </CardTitle>
          <CardDescription>
            Aggregated by student to prevent double-counting. Prioritized by overdue days, promised payments, and callback history.
          </CardDescription>
        </div>

        <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700">
          {sorted.length} {sorted.length === 1 ? "Student" : "Students"} Requiring Recovery
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Filter & Search Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by student, parent, invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Priority filter */}
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Priority:</span>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="p-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {/* Promise filter */}
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Promise:</span>
              <select
                value={promiseFilter}
                onChange={(e) => setPromiseFilter(e.target.value)}
                className="p-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none"
              >
                <option value="ALL">All Promises</option>
                <option value="BROKEN">Broken Promise</option>
                <option value="DUE_TODAY">Due Today</option>
                <option value="NO_PROMISE">No Promise</option>
              </select>
            </div>

            {/* Sort by */}
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "priority" | "amount" | "days" | "name")}
                className="p-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none font-medium"
              >
                <option value="priority">Priority Score (Highest)</option>
                <option value="amount">Overdue Amount</option>
                <option value="days">Days Overdue</option>
                <option value="name">Student Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Recovery Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3.5">Priority &amp; Score</th>
                <th className="py-2.5 px-3.5">Student / Parent</th>
                <th className="py-2.5 px-3.5">Overdue Amount</th>
                <th className="py-2.5 px-3.5">Overdue Days</th>
                <th className="py-2.5 px-3.5">Promise Status</th>
                <th className="py-2.5 px-3.5">Last Follow-Up</th>
                <th className="py-2.5 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="p-3 bg-emerald-50 rounded-full text-emerald-600">
                        <CalendarCheck className="w-6 h-6" />
                      </div>
                      <span className="font-semibold text-slate-800 text-sm">
                        {items.length === 0
                          ? "Zero Overdue Invoices"
                          : "No Overdue Invoices Match Filter"}
                      </span>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {items.length === 0
                          ? "All student tuition fees are fully settled or current. Overdue invoices will automatically appear here prioritized by urgency."
                          : "Try adjusting your search query or priority filters."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map((item) => (
                  <tr key={item.customerId} className="hover:bg-slate-50/60 transition-colors">
                    {/* Priority & Score */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getPriorityBadge(item.priorityCategory)}
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {item.priorityScore}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]" title={item.priorityReason}>
                        {item.priorityReason}
                      </div>
                    </td>

                    {/* Student / Parent */}
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-slate-900">{item.studentName}</div>
                      <div className="text-slate-500 text-[11px]">
                        Parent: {item.parentName}
                      </div>
                      <div className="text-slate-400 text-[10px] mt-0.5 flex items-center gap-1">
                        <span>{item.phone}</span>
                        <a
                          href={buildWhatsAppUrl(item.whatsappNumber || item.phone, `Hello ${item.parentName}, regarding ${item.studentName}'s tuition fee.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 inline-flex items-center"
                          title="Open WhatsApp chat"
                        >
                          <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                        </a>
                      </div>
                    </td>

                    {/* Overdue Amount */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="font-mono font-bold text-rose-600 text-sm">
                        {formatINR(item.totalOverdueAmount)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.invoiceNumbers.join(", ")}
                      </div>
                    </td>

                    {/* Overdue Days */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.maxOverdueDays} days</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Due: {item.oldestOverdueDueDate}
                      </div>
                    </td>

                    {/* Promise Status */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {getPromiseBadge(item)}
                    </td>

                    {/* Last Follow-Up */}
                    <td className="py-3 px-3.5">
                      {item.lastFollowUp ? (
                        <div>
                          <div className="font-medium text-slate-800 capitalize text-[11px]">
                            {item.lastFollowUp.outcome.replace("_", " ")}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.lastFollowUp.followUpDate}
                          </div>
                          {item.lastFollowUp.notes && (
                            <div className="text-[10px] text-slate-500 truncate max-w-[150px]" title={item.lastFollowUp.notes}>
                              &ldquo;{item.lastFollowUp.notes}&rdquo;
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No previous contact</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenReminder(item)}
                          className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100"
                          title="Generate WhatsApp Reminder"
                        >
                          <Send className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenFollowUp(item)}
                          className="p-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                          title="Log Follow-Up Activity"
                        >
                          <PhoneCall className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenRecordPayment(item)}
                          className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-100"
                          title="Record Received Payment"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
                      </div>
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
