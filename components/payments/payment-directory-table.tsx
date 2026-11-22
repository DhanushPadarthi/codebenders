"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  CreditCard,
  Printer,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import type { PaymentRecord, PaymentMode } from "@/lib/dal/payments";

interface PaymentDirectoryTableProps {
  payments: PaymentRecord[];
  onViewReceipt: (payment: PaymentRecord) => void;
  onRecordPaymentClick: () => void;
  initialSearch?: string;
}

type MethodFilter = "ALL" | PaymentMode;
type DateFilter = "ALL" | "TODAY" | "WEEK" | "MONTH";
type SortOption = "DATE_DESC" | "DATE_ASC" | "AMOUNT_DESC" | "AMOUNT_ASC";

export function PaymentDirectoryTable({
  payments,
  onViewReceipt,
  onRecordPaymentClick,
  initialSearch = "",
}: PaymentDirectoryTableProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("DATE_DESC");
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    if (initialSearch) {
      setSearchQuery(initialSearch);
    }
  }

  const [{ todayStr, weekAgoStr, monthPrefix }] = useState(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { todayStr: today, weekAgoStr: weekAgo, monthPrefix: today.slice(0, 7) };
  });

  // Filtering & Sorting pipeline
  const filteredPayments = useMemo(() => {
    return payments
      .filter((payment) => {
        // Search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const studentMatch = payment.customerName.toLowerCase().includes(query);
          const invoiceMatch = payment.invoiceNumber.toLowerCase().includes(query);
          const refMatch = payment.referenceId.toLowerCase().includes(query);
          const receiptMatch = payment.receiptNumber.toLowerCase().includes(query);
          const parentMatch = payment.parentName.toLowerCase().includes(query);
          if (!studentMatch && !invoiceMatch && !refMatch && !receiptMatch && !parentMatch) {
            return false;
          }
        }

        // Method Filter
        if (methodFilter !== "ALL") {
          if (payment.paymentMode !== methodFilter) {
            return false;
          }
        }

        // Date Filter
        if (dateFilter === "TODAY") {
          if (payment.paymentDate !== todayStr) return false;
        } else if (dateFilter === "WEEK") {
          if (payment.paymentDate < weekAgoStr) return false;
        } else if (dateFilter === "MONTH") {
          if (!payment.paymentDate.startsWith(monthPrefix)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === "DATE_DESC") {
          return b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt);
        }
        if (sortOption === "DATE_ASC") {
          return a.paymentDate.localeCompare(b.paymentDate) || a.createdAt.localeCompare(b.createdAt);
        }
        if (sortOption === "AMOUNT_DESC") {
          return b.amount - a.amount;
        }
        if (sortOption === "AMOUNT_ASC") {
          return a.amount - b.amount;
        }
        return 0;
      });
  }, [payments, searchQuery, methodFilter, dateFilter, sortOption, todayStr, weekAgoStr, monthPrefix]);

  const getMethodBadge = (mode: PaymentMode) => {
    switch (mode) {
      case "upi":
        return (
          <Badge variant="outline" className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border-indigo-200">
            UPI
          </Badge>
        );
      case "cash":
        return (
          <Badge variant="outline" className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
            Cash
          </Badge>
        );
      case "bank_transfer":
        return (
          <Badge variant="outline" className="text-[10px] font-bold bg-blue-50 text-blue-700 border-blue-200">
            Bank Transfer / NEFT
          </Badge>
        );
      case "cheque":
        return (
          <Badge variant="outline" className="text-[10px] font-bold bg-amber-50 text-amber-700 border-amber-200">
            Cheque
          </Badge>
        );
      case "other":
      default:
        return (
          <Badge variant="outline" className="text-[10px] font-bold bg-slate-100 text-slate-700 border-slate-200">
            Other
          </Badge>
        );
    }
  };

  const hasActiveFilters = searchQuery.trim() !== "" || methodFilter !== "ALL" || dateFilter !== "ALL";

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by student, parent, receipt #, or UTR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all font-medium"
          />
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
            className="text-xs rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Methods</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer / NEFT</option>
            <option value="cheque">Cheque</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="text-xs rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold cursor-pointer shadow-2xs"
          >
            <option value="ALL">All Time</option>
            <option value="TODAY">Today</option>
            <option value="WEEK">Last 7 Days</option>
            <option value="MONTH">This Month</option>
          </select>

          {/* Sort Option */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="text-xs rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold cursor-pointer shadow-2xs"
          >
            <option value="DATE_DESC">Newest Date</option>
            <option value="DATE_ASC">Oldest Date</option>
            <option value="AMOUNT_DESC">Highest Amount</option>
            <option value="AMOUNT_ASC">Lowest Amount</option>
          </select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setMethodFilter("ALL");
                setDateFilter("ALL");
              }}
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
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Student &amp; Batch</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4">Payment Date</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <CreditCard className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        {hasActiveFilters ? "No matching payment records" : "No payments recorded yet"}
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium">
                        {hasActiveFilters
                          ? "Try clearing your filters or searching with a different student name or UTR reference."
                          : "Record your first student fee settlement. Settle invoice balances via UPI, cash, cheque or direct bank transfers."}
                      </p>
                      <div className="pt-2">
                        {hasActiveFilters ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearchQuery("");
                              setMethodFilter("ALL");
                              setDateFilter("ALL");
                            }}
                            className="text-xs font-semibold"
                          >
                            Reset Filters
                          </Button>
                        ) : (
                          <Button
                            onClick={onRecordPaymentClick}
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Record First Payment</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Receipt Number */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {p.receiptNumber}
                    </td>

                    {/* Student Name */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block group-hover:text-indigo-600 transition-colors">
                        {p.customerName}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Parent: {p.parentName}
                      </span>
                    </td>

                    {/* Invoice Reference */}
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-700 tabular-nums">
                      {p.invoiceNumber}
                    </td>

                    {/* Payment Mode */}
                    <td className="py-3.5 px-4">{getMethodBadge(p.paymentMode)}</td>

                    {/* Payment Date */}
                    <td className="py-3.5 px-4 text-slate-600 tabular-nums font-medium">
                      {formatDate(p.paymentDate, "short")}
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 text-sm tabular-nums">
                      +{formatINR(p.amount)}
                    </td>

                    {/* Action: Print Receipt */}
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewReceipt(p)}
                        className="h-7 px-2.5 text-xs text-slate-600 hover:text-slate-900 gap-1.5 font-semibold"
                        title="Print / View Receipt"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">Receipt</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        {payments.length > 0 && (
          <div className="p-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-medium">
            <span className="tabular-nums">
              Showing <strong className="text-slate-800 font-bold">{filteredPayments.length}</strong> of{" "}
              <strong className="text-slate-800 font-bold">{payments.length}</strong> payments
            </span>
            <span className="text-[11px] text-slate-400">
              Each recorded payment is permanently stamped with integer paise accuracy and idempotent receipt tracking.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
