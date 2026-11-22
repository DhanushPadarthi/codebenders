"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  RefreshCw,
  Clock,
  Check,
  Building,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import type { BillRecord } from "@/lib/dal/bills";
import { EXPENSE_CATEGORIES } from "@/lib/finance/expense-calculations";

interface ExpenseDirectoryTableProps {
  bills: BillRecord[];
  onMarkPaid: (bill: BillRecord) => void;
  onAddExpenseClick: () => void;
  onArchiveBill?: (bill: BillRecord) => void;
}

type ExpenseTab = "ALL" | "UPCOMING" | "OVERDUE" | "PAID";
type SortOption = "DUE_ASC" | "DUE_DESC" | "AMOUNT_DESC" | "AMOUNT_ASC";

export function ExpenseDirectoryTable({
  bills,
  onMarkPaid,
  onAddExpenseClick,
  onArchiveBill,
}: ExpenseDirectoryTableProps) {
  const [activeTab, setActiveTab] = useState<ExpenseTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("DUE_ASC");

  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));

  // Tab counts based on real database records
  const tabCounts = useMemo(() => {
    let upcoming = 0;
    let overdue = 0;
    let paid = 0;

    bills.forEach((b) => {
      if (b.status === "paid") {
        paid += 1;
      } else if (b.status === "overdue" || b.dueDate < todayStr) {
        overdue += 1;
      } else {
        upcoming += 1;
      }
    });

    return { all: bills.length, upcoming, overdue, paid };
  }, [bills, todayStr]);

  // Filtering & Sorting
  const filteredBills = useMemo(() => {
    return bills
      .filter((b) => {
        // Tab Filter
        if (activeTab === "PAID" && b.status !== "paid") return false;
        if (activeTab === "OVERDUE") {
          const isOverdue = b.status === "overdue" || (b.status !== "paid" && b.dueDate < todayStr);
          if (!isOverdue) return false;
        }
        if (activeTab === "UPCOMING") {
          const isUpcoming = b.status !== "paid" && b.dueDate >= todayStr;
          if (!isUpcoming) return false;
        }

        // Search Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = b.title.toLowerCase().includes(q);
          const matchVendor = b.vendorName.toLowerCase().includes(q);
          const matchNotes = b.notes?.toLowerCase().includes(q) || false;
          if (!matchTitle && !matchVendor && !matchNotes) return false;
        }

        // Category Filter
        if (selectedCategory !== "ALL" && b.uiCategory !== selectedCategory) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === "DUE_ASC") {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (sortOption === "DUE_DESC") {
          return b.dueDate.localeCompare(a.dueDate);
        }
        if (sortOption === "AMOUNT_DESC") {
          return b.amount - a.amount;
        }
        if (sortOption === "AMOUNT_ASC") {
          return a.amount - b.amount;
        }
        return 0;
      });
  }, [bills, activeTab, searchQuery, selectedCategory, sortOption, todayStr]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("ALL");
    setSortOption("DUE_ASC");
    setActiveTab("ALL");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" || selectedCategory !== "ALL" || activeTab !== "ALL";

  return (
    <div className="space-y-4">
      {/* Tab Navigation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "ALL"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Overheads ({tabCounts.all})
          </button>

          <button
            onClick={() => setActiveTab("UPCOMING")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "UPCOMING"
                ? "bg-white text-indigo-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Upcoming & Due ({tabCounts.upcoming})
          </button>

          <button
            onClick={() => setActiveTab("OVERDUE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "OVERDUE"
                ? "bg-white text-rose-700 shadow-2xs"
                : "text-slate-600 hover:text-rose-700"
            }`}
          >
            Overdue ({tabCounts.overdue})
          </button>

          <button
            onClick={() => setActiveTab("PAID")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "PAID"
                ? "bg-white text-emerald-700 shadow-2xs"
                : "text-slate-600 hover:text-emerald-700"
            }`}
          >
            Paid & Settled ({tabCounts.paid})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={onAddExpenseClick}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Expense</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by expense title, payee vendor, or reference..."
            className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Sort Dropdown */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="text-xs px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="DUE_ASC">Due Date (Earliest)</option>
            <option value="DUE_DESC">Due Date (Latest)</option>
            <option value="AMOUNT_DESC">Amount (Highest)</option>
            <option value="AMOUNT_ASC">Amount (Lowest)</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10.5px]">
                <th className="py-3 px-4">Expense Description</th>
                <th className="py-3 px-4">Payee / Vendor</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Recurrence</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Settlement Details</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredBills.length > 0 ? (
                filteredBills.map((bill) => {
                  const isPaid = bill.status === "paid";
                  const isOverdue = !isPaid && (bill.status === "overdue" || bill.dueDate < todayStr);

                  return (
                    <tr
                      key={bill.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Description */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{bill.title}</span>
                        </div>
                        {bill.notes && (
                          <div className="text-[11px] text-slate-500 truncate max-w-xs italic">
                            {bill.notes}
                          </div>
                        )}
                      </td>

                      {/* Payee / Vendor */}
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {bill.vendorName}
                      </td>

                      {/* Category Pill */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {bill.uiCategory}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900">
                        {formatINR(bill.amount)}
                      </td>

                      {/* Due Date */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={
                            isOverdue
                              ? "font-semibold text-rose-600"
                              : isPaid
                              ? "text-slate-500"
                              : "text-slate-800 font-medium"
                          }
                        >
                          {formatDate(bill.dueDate, "short")}
                        </span>
                      </td>

                      {/* Recurrence */}
                      <td className="py-3 px-4">
                        {bill.isRecurring ? (
                          <div className="flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50/70 border border-indigo-200/60 px-2 py-0.5 rounded w-fit">
                            <RefreshCw className="w-3 h-3 text-indigo-600 shrink-0" />
                            <span className="capitalize">{bill.recurringFrequency || "Monthly"}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">One-time</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {isPaid ? (
                          <Badge variant="success" className="gap-1 text-[10px]">
                            <Check className="w-3 h-3" /> PAID
                          </Badge>
                        ) : isOverdue ? (
                          <Badge variant="danger" className="gap-1 text-[10px]">
                            <AlertCircle className="w-3 h-3" /> OVERDUE
                          </Badge>
                        ) : (
                          <Badge variant="info" className="gap-1 text-[10px]">
                            <Clock className="w-3 h-3" /> UPCOMING
                          </Badge>
                        )}
                      </td>

                      {/* Settlement Details */}
                      <td className="py-3 px-4">
                        {isPaid ? (
                          <div className="space-y-0.5">
                            <div className="text-[11px] font-semibold text-emerald-800">
                              Paid {bill.paidDate ? formatDate(bill.paidDate, "short") : "—"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Pending settlement</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isPaid ? (
                            <Button
                              size="sm"
                              onClick={() => onMarkPaid(bill)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-2.5 gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Mark Paid</span>
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium mr-1">Reconciled</span>
                          )}

                          {onArchiveBill && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onArchiveBill(bill)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Archive overhead record"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <Building className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {bills.length === 0
                            ? "No operating overheads recorded yet"
                            : "No overhead expenses match your criteria"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {bills.length === 0
                            ? "Add your centre rent, utilities, teaching materials, and tutor honorariums to track outflow schedules."
                            : "Try switching tabs, clearing search keywords, or selecting another category."}
                        </p>
                      </div>
                      {hasActiveFilters ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearFilters}
                          className="text-xs"
                        >
                          Clear Filters
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={onAddExpenseClick}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Record First Expense</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
