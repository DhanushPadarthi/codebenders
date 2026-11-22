"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  ArrowUpDown,
  FileText,
  Eye,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatINR, formatDate } from "@/lib/formatters";
import type { InvoiceRecord } from "@/lib/dal/invoices";
import type { InvoiceStatus } from "@/types/database.types";

interface InvoiceDirectoryTableProps {
  invoices: InvoiceRecord[];
  onSelectInvoice: (invoice: InvoiceRecord) => void;
  onMarkAsSent?: (invoiceId: string) => void;
  initialSearch?: string;
}

export function InvoiceDirectoryTable({
  invoices,
  onSelectInvoice,
  onMarkAsSent,
  initialSearch = "",
}: InvoiceDirectoryTableProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "due_date" | "amount_desc" | "balance_desc">("date_desc");
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    if (initialSearch) {
      setSearchQuery(initialSearch);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        const effectiveStatus = inv.effectiveStatus || inv.status;

        // Status filter
        if (statusFilter !== "all") {
          if (statusFilter === "partially_paid") {
            const hasPartial =
              effectiveStatus === "partially_paid" ||
              (inv.amountPaid > 0 && inv.balanceDue > 0);
            if (!hasPartial) return false;
          } else if (statusFilter === "overdue") {
            const isOverdue =
              effectiveStatus === "overdue" ||
              (inv.dueDate < today && inv.balanceDue > 0 && inv.status !== "draft");
            if (!isOverdue) return false;
          } else if (effectiveStatus !== statusFilter) {
            return false;
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchNum = inv.invoiceNumber.toLowerCase().includes(q);
          const matchName = inv.customerName.toLowerCase().includes(q);
          const matchGrade = inv.customerGrade.toLowerCase().includes(q);
          const matchPhone = inv.parentPhone.includes(q);
          const matchParent = inv.parentName.toLowerCase().includes(q);
          return matchNum || matchName || matchGrade || matchPhone || matchParent;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") {
          return b.issueDate.localeCompare(a.issueDate);
        }
        if (sortBy === "due_date") {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (sortBy === "amount_desc") {
          return b.totalAmount - a.totalAmount;
        }
        if (sortBy === "balance_desc") {
          return b.balanceDue - a.balanceDue;
        }
        return 0;
      });
  }, [invoices, statusFilter, searchQuery, sortBy, today]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortBy("date_desc");
  };

  const getStatusBadge = (inv: InvoiceRecord) => {
    const status = inv.effectiveStatus || inv.status;
    switch (status) {
      case "paid":
        return (
          <Badge variant="success" className="gap-1 text-[10px] font-semibold">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </Badge>
        );
      case "partially_paid":
        return (
          <Badge variant="warning" className="gap-1 text-[10px] font-semibold">
            <Clock className="w-3 h-3" /> Partial
          </Badge>
        );
      case "overdue":
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="danger" className="gap-1 text-[10px] font-semibold">
              <AlertCircle className="w-3 h-3" /> Overdue
              {inv.overdueDays !== undefined && inv.overdueDays > 0 ? ` (${inv.overdueDays}d)` : ""}
            </Badge>
            {inv.amountPaid > 0 ? (
              <span className="text-[9.5px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 tabular-nums">
                Part-Paid ({formatINR(inv.amountPaid)})
              </span>
            ) : null}
          </div>
        );
      case "sent":
        return (
          <Badge variant="info" className="gap-1 text-[10px] font-semibold">
            <Send className="w-3 h-3" /> Sent
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="secondary" className="gap-1 text-[10px] font-semibold">
            Draft
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="gap-1 text-[10px] text-slate-500 font-semibold">
            Voided
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px] font-semibold">
            {status}
          </Badge>
        );
    }
  };

  return (
    <Card className="border-slate-200/90 shadow-sm overflow-hidden bg-white">
      <CardHeader className="p-5 pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700">
              <FileText className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">
              Fee Invoices Directory
            </CardTitle>
          </div>
          <CardDescription className="mt-0.5">
            Filter, inspect, transition, and print tuition fee invoices for all batches.
          </CardDescription>
        </div>

        <Link href="/invoices/new">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 self-start md:self-auto shadow-xs"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Create Fee Invoice</span>
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {/* Controls Bar: Search, Status tabs, and Sort */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by invoice #, student, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Filter Pills & Sort Dropdown */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Status Pills */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60 font-semibold">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All ({invoices.length})
              </button>
              <button
                onClick={() => setStatusFilter("draft")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === "draft"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Draft ({invoices.filter((i) => i.status === "draft").length})
              </button>
              <button
                onClick={() => setStatusFilter("sent")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === "sent"
                    ? "bg-white text-blue-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sent ({invoices.filter((i) => i.status === "sent").length})
              </button>
              <button
                onClick={() => setStatusFilter("overdue")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === "overdue"
                    ? "bg-white text-rose-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Overdue (
                {
                  invoices.filter((i) => {
                    const st = i.effectiveStatus || i.status;
                    return (
                      st === "overdue" ||
                      (i.dueDate < today && i.balanceDue > 0 && i.status !== "draft")
                    );
                  }).length
                }
                )
              </button>
              <button
                onClick={() => setStatusFilter("paid")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === "paid"
                    ? "bg-white text-emerald-800 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paid ({invoices.filter((i) => i.status === "paid").length})
              </button>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 border border-slate-200/90 rounded-xl px-3 py-2 bg-white text-slate-700 shadow-2xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as "date_desc" | "due_date" | "amount_desc" | "balance_desc"
                  )
                }
                className="text-xs bg-transparent focus:outline-hidden text-slate-700 cursor-pointer font-semibold"
              >
                <option value="date_desc">Newest Issue Date</option>
                <option value="due_date">Earliest Due Date</option>
                <option value="amount_desc">Highest Invoice Total</option>
                <option value="balance_desc">Highest Balance Due</option>
              </select>
            </div>

            {(searchQuery || statusFilter !== "all" || sortBy !== "date_desc") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 px-2.5 text-xs text-slate-500 hover:text-slate-900 font-semibold"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Invoices Table */}
        <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Student &amp; Batch</th>
                <th className="py-3 px-4 hidden md:table-cell">Issue Date</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                        <FileText className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        No tuition invoices created yet
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Generate your first student fee invoice. Select an enrolled student, specify monthly tuition or test-series fees, and share instant UPI payment links.
                      </p>
                      <div className="pt-2">
                        <Link href="/invoices/new">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Create First Invoice</span>
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="space-y-2">
                      <Filter className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                      <p className="font-bold text-slate-800">
                        No invoices match your active filters
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Try searching with a different term or clearing your status filter.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                        className="mt-2 text-xs font-semibold"
                      >
                        Reset All Filters
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const isOverdue =
                    inv.status === "overdue" ||
                    inv.effectiveStatus === "overdue" ||
                    (inv.dueDate < today && inv.balanceDue > 0 && inv.status !== "draft");

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectInvoice(inv)}
                    >
                      {/* Invoice Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                        {inv.invoiceNumber}
                      </td>

                      {/* Student & Batch */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 block group-hover:text-indigo-600 transition-colors">
                          {inv.customerName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {inv.customerGrade}
                        </span>
                      </td>

                      {/* Issue Date */}
                      <td className="py-3.5 px-4 hidden md:table-cell text-slate-500 tabular-nums font-medium">
                        {formatDate(inv.issueDate, "short")}
                      </td>

                      {/* Due Date */}
                      <td className="py-3.5 px-4 tabular-nums">
                        <span
                          className={
                            isOverdue
                              ? "font-bold text-rose-600"
                              : "text-slate-600 font-medium"
                          }
                        >
                          {formatDate(inv.dueDate, "short")}
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {formatINR(inv.totalAmount)}
                      </td>

                      {/* Balance Due */}
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {inv.balanceDue > 0 ? (
                          <span
                            className={
                              isOverdue
                                ? "font-bold text-rose-600"
                                : "font-semibold text-slate-900"
                            }
                          >
                            {formatINR(inv.balanceDue)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{getStatusBadge(inv)}</td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {inv.status === "draft" && onMarkAsSent && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] font-semibold gap-1 text-slate-700 hover:text-slate-900"
                              onClick={() => onMarkAsSent(inv.id)}
                            >
                              <Send className="w-3 h-3 text-slate-500" />
                              <span>Issue</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                            title="Inspect Invoice"
                            onClick={() => onSelectInvoice(inv)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
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
        {invoices.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-500 font-medium">
            <span className="tabular-nums">
              Showing <strong className="text-slate-800 font-bold">{filteredInvoices.length}</strong> of{" "}
              <strong className="text-slate-800 font-bold">{invoices.length}</strong> invoices
            </span>
            <span className="text-[11px] text-slate-400">
              Click any invoice row to view line items, print slips, and manage status transitions.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
