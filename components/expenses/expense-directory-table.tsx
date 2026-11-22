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
  initialSearch?: string;
}

type ExpenseTab = "ALL" | "UPCOMING" | "OVERDUE" | "PAID";
type SortOption = "DUE_ASC" | "DUE_DESC" | "AMOUNT_DESC" | "AMOUNT_ASC";

export function ExpenseDirectoryTable({
  bills,
  onMarkPaid,
  onAddExpenseClick,
  onArchiveBill,
  initialSearch = "",
}: ExpenseDirectoryTableProps) {
  const [activeTab, setActiveTab] = useState<ExpenseTab>("ALL");
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("DUE_ASC");
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    if (initialSearch) {
      setSearchQuery(initialSearch);
    }
  }

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

  const getCategoryBadge = (category: string) => {
    switch (category.toLowerCase()) {
      case "rent":
      case "coaching centre rent":
        return (
          <Badge variant="purple" className="text-[10px] font-semibold">
            Rent
          </Badge>
        );
      case "salaries":
      case "teacher honorarium":
      case "faculty honorarium":
        return (
          <Badge variant="info" className="text-[10px] font-semibold">
            Staff / Honorarium
          </Badge>
        );
      case "utilities":
      case "electricity & wifi":
        return (
          <Badge variant="warning" className="text-[10px] font-semibold">
            Utilities
          </Badge>
        );
      case "study materials":
      case "printing & stationery":
        return (
          <Badge variant="success" className="text-[10px] font-semibold">
            Materials
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] font-semibold">
            {category}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl font-semibold text-xs">
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "ALL"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Overheads ({tabCounts.all})
          </button>

          <button
            onClick={() => setActiveTab("UPCOMING")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "UPCOMING"
                ? "bg-white text-indigo-700 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Upcoming ({tabCounts.upcoming})
          </button>

          <button
            onClick={() => setActiveTab("OVERDUE")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "OVERDUE"
                ? "bg-white text-rose-700 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Overdue ({tabCounts.overdue})
          </button>

          <button
            onClick={() => setActiveTab("PAID")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "PAID"
                ? "bg-white text-emerald-800 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Settled ({tabCounts.paid})
          </button>
        </div>

        <Button
          onClick={onAddExpenseClick}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Expense</span>
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by bill title, vendor name, or remarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all font-medium"
          />
        </div>

        {/* Category & Sort controls */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Categories</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="text-xs rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold cursor-pointer shadow-2xs"
          >
            <option value="DUE_ASC">Due Date (Earliest First)</option>
            <option value="DUE_DESC">Due Date (Latest First)</option>
            <option value="AMOUNT_DESC">Amount (High to Low)</option>
            <option value="AMOUNT_ASC">Amount (Low to High)</option>
          </select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 px-2.5 text-xs text-slate-500 hover:text-slate-900 gap-1 font-semibold"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Directory Table */}
      <div className="rounded-2xl border border-slate-200/90 overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Title &amp; Vendor</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <Building className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        {hasActiveFilters ? "No matching expense records" : "No operational expenses found"}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        {hasActiveFilters
                          ? "Try clearing your filters or selecting a different category."
                          : "Track rent, teacher salaries, and utility bills. FeePulse incorporates these overheads into your 30-day runway forecast."}
                      </p>
                      <div className="pt-2">
                        {hasActiveFilters ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearFilters}
                            className="text-xs font-semibold"
                          >
                            Reset Filters
                          </Button>
                        ) : (
                          <Button
                            onClick={onAddExpenseClick}
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1.5 shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Add First Expense</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBills.map((b) => {
                  const isOverdue =
                    b.status === "overdue" || (b.status !== "paid" && b.dueDate < todayStr);

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Title & Vendor */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 block group-hover:text-indigo-600 transition-colors">
                            {b.title}
                          </span>
                          {b.isRecurring && (
                            <span
                              title={`Recurring: ${b.recurringFrequency || "Monthly"}`}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium">
                          Vendor: {b.vendorName || "Operational"}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">{getCategoryBadge(b.category)}</td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4 tabular-nums">
                        <span
                          className={
                            isOverdue
                              ? "font-bold text-rose-600"
                              : "text-slate-600 font-medium"
                          }
                        >
                          {formatDate(b.dueDate, "short")}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm tabular-nums">
                        {formatINR(b.amount)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {b.status === "paid" ? (
                          <Badge variant="success" className="gap-1 text-[10px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Settled
                          </Badge>
                        ) : isOverdue ? (
                          <Badge variant="danger" className="gap-1 text-[10px] font-semibold">
                            <AlertCircle className="w-3 h-3" /> Overdue
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="gap-1 text-[10px] font-semibold">
                            <Clock className="w-3 h-3" /> Due Soon
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {b.status !== "paid" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onMarkPaid(b)}
                              className="h-7 px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 border-emerald-200 gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Settle</span>
                            </Button>
                          )}
                          {onArchiveBill && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onArchiveBill(b)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                              title="Archive Bill"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        {bills.length > 0 && (
          <div className="p-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-medium">
            <span className="tabular-nums">
              Showing <strong className="text-slate-800 font-bold">{filteredBills.length}</strong> of{" "}
              <strong className="text-slate-800 font-bold">{bills.length}</strong> expenses
            </span>
            <span className="text-[11px] text-slate-400">
              Operating expenses are incorporated into daily cash runway calculations with integer paise precision.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
