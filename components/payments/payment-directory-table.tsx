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
}

type MethodFilter = "ALL" | PaymentMode;
type DateFilter = "ALL" | "TODAY" | "WEEK" | "MONTH";
type SortOption = "DATE_DESC" | "DATE_ASC" | "AMOUNT_DESC" | "AMOUNT_ASC";

export function PaymentDirectoryTable({
  payments,
  onViewReceipt,
  onRecordPaymentClick,
}: PaymentDirectoryTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("DATE_DESC");

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
          <Badge variant="outline" className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border-indigo-200">
            UPI
          </Badge>
        );
      case "cash":
        return (
          <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
            Cash
          </Badge>
        );
      case "bank_transfer":
        return (
          <Badge variant="outline" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200">
            Bank Transfer / NEFT
          </Badge>
        );
      case "cheque":
        return (
          <Badge variant="outline" className="text-[10px] font-semibold bg-amber-50 text-amber-700 border-amber-200">
            Cheque
          </Badge>
        );
      case "other":
      default:
        return (
          <Badge variant="outline" className="text-[10px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
            Other
          </Badge>
        );
    }
  };

  const hasActiveFilters = searchQuery.trim() !== "" || methodFilter !== "ALL" || dateFilter !== "ALL";

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by student, invoice #, receipt #, or UTR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Badges & Sorters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
            className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="ALL">All Methods</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer / NEFT</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="ALL">All Dates</option>
            <option value="TODAY">Today</option>
            <option value="WEEK">Last 7 Days</option>
            <option value="MONTH">This Month</option>
          </select>

          {/* Sorter */}
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="DATE_DESC">Date (Newest First)</option>
            <option value="DATE_ASC">Date (Oldest First)</option>
            <option value="AMOUNT_DESC">Amount (High to Low)</option>
            <option value="AMOUNT_ASC">Amount (Low to High)</option>
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
              className="text-xs h-8 px-2 text-slate-500 hover:text-slate-800"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            {payments.length === 0 ? (
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-bold text-slate-900 text-base">No payments recorded yet</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Record tuition fees received via UPI, cash, bank transfer, or cheque against issued student invoices.
                </p>
                <div className="pt-2">
                  <Button
                    onClick={onRecordPaymentClick}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record First Payment</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="font-bold text-slate-900 text-sm">No matching payments found</h3>
                <p className="text-xs text-slate-500">
                  Try adjusting your search query, payment method, or date filter range.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setMethodFilter("ALL");
                    setDateFilter("ALL");
                  }}
                  className="text-xs h-7 mt-1"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Receipt # / Date</th>
                  <th className="py-3 px-4">Student & Batch</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Reference / UTR</th>
                  <th className="py-3 px-4 text-right">Amount Paid</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => onViewReceipt(payment)}
                  >
                    {/* Receipt Number & Date */}
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {payment.receiptNumber}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDate(payment.paymentDate)}
                      </div>
                    </td>

                    {/* Student Name & Grade */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{payment.customerName}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {payment.customerGrade}
                        {payment.parentName ? ` • ${payment.parentName}` : ""}
                      </div>
                    </td>

                    {/* Invoice Link */}
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100">
                        {payment.invoiceNumber}
                      </span>
                    </td>

                    {/* Payment Mode */}
                    <td className="py-3 px-4">
                      {getMethodBadge(payment.paymentMode)}
                    </td>

                    {/* Reference / UTR */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-slate-600 text-[11px]">
                        {payment.referenceId}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 text-right">
                      <span className="font-mono font-bold text-emerald-700 text-sm">
                        {formatINR(payment.amount)}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewReceipt(payment)}
                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 gap-1"
                        title="Print Receipt Slip"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Receipt</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
