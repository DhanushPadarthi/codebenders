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
}

export function InvoiceDirectoryTable({
  invoices,
  onSelectInvoice,
  onMarkAsSent,
}: InvoiceDirectoryTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "due_date" | "amount_desc" | "balance_desc">("date_desc");

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
          <Badge variant="success" className="gap-1 text-[10px]">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </Badge>
        );
      case "partially_paid":
        return (
          <Badge variant="warning" className="gap-1 text-[10px]">
            <Clock className="w-3 h-3" /> Partial
          </Badge>
        );
      case "overdue":
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="danger" className="gap-1 text-[10px]">
              <AlertCircle className="w-3 h-3" /> Overdue
              {inv.overdueDays !== undefined && inv.overdueDays > 0 ? ` (${inv.overdueDays}d)` : ""}
            </Badge>
            {inv.amountPaid > 0 ? (
              <span className="text-[9.5px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                Part-Paid ({formatINR(inv.amountPaid)})
              </span>
            ) : null}
          </div>
        );
      case "sent":
        return (
          <Badge variant="info" className="gap-1 text-[10px]">
            <Send className="w-3 h-3" /> Sent
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            Draft
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="gap-1 text-[10px] text-slate-400">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[10px]">
            {status}
          </Badge>
        );
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="p-5 pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
              <FileText className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">
              Fee Invoices Directory
            </CardTitle>
          </div>
          <CardDescription className="mt-0.5">
            Audit and reconcile student fee invoices, due dates, and settlement statuses.
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
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by invoice #, student, or parent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Filter Pills & Selectors */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Status Pills */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200/60">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 font-medium rounded-md transition-all ${
                  statusFilter === "all"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All ({invoices.length})
              </button>
              <button
                onClick={() => setStatusFilter("draft")}
                className={`px-2.5 py-1 font-medium rounded-md transition-all ${
                  statusFilter === "draft"
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Drafts ({invoices.filter((i) => i.status === "draft").length})
              </button>
              <button
                onClick={() => setStatusFilter("sent")}
                className={`px-2.5 py-1 font-medium rounded-md transition-all ${
                  statusFilter === "sent"
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Sent ({invoices.filter((i) => i.status === "sent").length})
              </button>
              <button
                onClick={() => setStatusFilter("overdue")}
                className={`px-2.5 py-1 font-medium rounded-md transition-all ${
                  statusFilter === "overdue"
                    ? "bg-white text-rose-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Overdue (
                {
                  invoices.filter(
                    (i) =>
                      (i.status === "overdue" ||
                        i.effectiveStatus === "overdue" ||
                        (i.dueDate < today && i.balanceDue > 0)) &&
                      i.status !== "draft"
                  ).length
                }
                )
              </button>
              <button
                onClick={() => setStatusFilter("paid")}
                className={`px-2.5 py-1 font-medium rounded-md transition-all ${
                  statusFilter === "paid"
                    ? "bg-white text-emerald-800 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Paid ({invoices.filter((i) => i.status === "paid" || i.effectiveStatus === "paid").length})
              </button>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as "date_desc" | "due_date" | "amount_desc" | "balance_desc"
                  )
                }
                className="text-xs bg-transparent focus:outline-none text-slate-700 cursor-pointer"
              >
                <option value="date_desc">Issue Date (Newest)</option>
                <option value="due_date">Due Date (Earliest)</option>
                <option value="amount_desc">Total Amount (Highest)</option>
                <option value="balance_desc">Balance Due (Highest)</option>
              </select>
            </div>

            {(searchQuery || statusFilter !== "all" || sortBy !== "date_desc") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Invoices Table View */}
        <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Billed Student</th>
                <th className="py-3 px-4 hidden sm:table-cell">Dates</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                /* Empty Database State */
                <tr>
                  <td colSpan={7} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                        <FileText className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        No invoices created yet
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Start drafting and scheduling tuition fee invoices for your enrolled students. You can include multiple line items, customized discounts, and due dates.
                      </p>
                      <div className="pt-2">
                        <Link href="/invoices/new">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Create Your First Fee Invoice</span>
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                /* Filter Miss State */
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="space-y-2">
                      <Filter className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                      <p className="font-semibold text-slate-700">
                        No invoices match your active filters
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Try searching with a different term or clearing your status filters.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                        className="mt-2 text-xs"
                      >
                        Reset All Filters
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                /* Invoice Rows */
                filteredInvoices.map((inv) => {
                  const isDraft = inv.status === "draft";

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectInvoice(inv)}
                    >
                      {/* Invoice # */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {inv.invoiceNumber}
                      </td>

                      {/* Student & Batch */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 block">
                          {inv.customerName}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {inv.customerGrade}
                        </span>
                      </td>

                      {/* Issue & Due Dates */}
                      <td className="py-3.5 px-4 hidden sm:table-cell text-[11px] text-slate-500">
                        <div>
                          Issued: <span className="text-slate-700">{formatDate(inv.issueDate, "short")}</span>
                        </div>
                        <div>
                          Due: <span className="text-slate-700">{formatDate(inv.dueDate, "short")}</span>
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900">
                        {formatINR(inv.totalAmount)}
                      </td>

                      {/* Balance Due */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        {inv.balanceDue > 0 ? (
                          <span className="text-rose-600">{formatINR(inv.balanceDue)}</span>
                        ) : (
                          <span className="text-emerald-600 font-semibold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Clear
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {getStatusBadge(inv)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isDraft && onMarkAsSent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-800 gap-1"
                              title="Mark as Sent"
                              onClick={() => onMarkAsSent(inv.id)}
                            >
                              <Send className="w-3 h-3" />
                              <span className="hidden md:inline">Send</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 gap-1"
                            onClick={() => onSelectInvoice(inv)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
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

        {/* Directory Footer */}
        {invoices.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-500">
            <span>
              Showing <strong className="text-slate-800">{filteredInvoices.length}</strong> of{" "}
              <strong className="text-slate-800">{invoices.length}</strong> invoices
            </span>
            <span className="text-[11px] text-slate-400">
              Click any invoice row to view line items, print A4 slips, or transition lifecycle status.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
