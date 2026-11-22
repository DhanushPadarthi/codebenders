"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  ArrowUpRight,
  Send,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileEdit,
  Plus,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatDate } from "@/lib/formatters";
import { useInvoices } from "@/lib/invoice-context";
import type { InvoiceRecord } from "@/lib/dal/invoices";

interface DisplayInvoiceItem {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerGrade?: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  effectiveStatus?: string;
  overdueDays?: number;
}

export interface RecentInvoicesTableProps {
  invoices?: InvoiceRecord[];
}

export function RecentInvoicesTable(props: RecentInvoicesTableProps) {
  const [filter, setFilter] = useState<"all" | "pending" | "overdue" | "paid">("all");
  const fallbackContext = useInvoices();

  const rawInvoices: DisplayInvoiceItem[] = props.invoices ?? fallbackContext.invoices;

  const filteredInvoices = rawInvoices.filter((inv) => {
    const status = inv.effectiveStatus || inv.status;
    if (filter === "pending") return status === "sent" || status === "partially_paid";
    if (filter === "overdue") return status === "overdue";
    if (filter === "paid") return status === "paid";
    return true;
  });

  const displayInvoices = filteredInvoices.slice(0, 8);

  const getStatusBadge = (
    status: string,
    overdueDays?: number,
    amountPaid?: number
  ) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </Badge>
        );
      case "partially_paid":
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="w-3 h-3" /> Partially Paid
          </Badge>
        );
      case "overdue":
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="danger" className="gap-1">
              <AlertCircle className="w-3 h-3" /> Overdue ({overdueDays || 0}d)
            </Badge>
            {amountPaid && amountPaid > 0 ? (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Part-Paid
              </span>
            ) : null}
          </div>
        );
      case "sent":
        return (
          <Badge variant="info" className="gap-1">
            <Send className="w-3 h-3" /> Sent
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="gap-1 text-slate-500">
            Cancelled
          </Badge>
        );
      case "draft":
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            <FileEdit className="w-3 h-3" /> Draft
          </Badge>
        );
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
              <FileText className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">
              Recent Fee Invoices
            </CardTitle>
          </div>
          <CardDescription className="mt-1">
            Student fee billing records across tuition batches.
          </CardDescription>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/60 self-start sm:self-auto text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 font-medium rounded-md transition-all ${
              filter === "all"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({rawInvoices.length})
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`px-2.5 py-1 font-medium rounded-md transition-all ${
              filter === "pending"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("overdue")}
            className={`px-2.5 py-1 font-medium rounded-md transition-all ${
              filter === "overdue"
                ? "bg-white text-rose-700 shadow-xs"
                : "text-slate-600 hover:text-rose-600"
            }`}
          >
            Overdue
          </button>
          <button
            onClick={() => setFilter("paid")}
            className={`px-2.5 py-1 font-medium rounded-md transition-all ${
              filter === "paid"
                ? "bg-white text-emerald-700 shadow-xs"
                : "text-slate-600 hover:text-emerald-600"
            }`}
          >
            Paid
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {rawInvoices.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">No invoices generated yet</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Create your first student fee invoice to start tracking fee collections.
              </p>
            </div>
            <Link href="/invoices/new">
              <Button size="sm" className="text-xs bg-slate-900 text-white gap-1.5 shadow-2xs mt-2">
                <Plus className="w-3.5 h-3.5" />
                <span>Create Invoice</span>
              </Button>
            </Link>
          </div>
        ) : displayInvoices.length === 0 ? (
          <div className="text-center py-8 px-4 text-xs text-slate-500">
            No invoices found for filter &ldquo;{filter}&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Student &amp; Batch</th>
                  <th className="py-3 px-4 hidden md:table-cell">Issue Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {displayInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">
                        {inv.customerName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {inv.customerGrade || "General Batch"}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 hidden md:table-cell text-slate-500">
                      {formatDate(inv.issueDate, "short")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={
                          inv.status === "overdue"
                            ? "font-semibold text-rose-600"
                            : "text-slate-600"
                        }
                      >
                        {formatDate(inv.dueDate, "short")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      {formatINR(inv.totalAmount)}
                      {inv.amountPaid > 0 && inv.status !== "paid" && (
                        <span className="block text-[10px] font-normal text-emerald-600">
                          Paid: {formatINR(inv.amountPaid)}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(
                        inv.effectiveStatus || inv.status,
                        inv.overdueDays,
                        inv.amountPaid
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/invoices?id=${inv.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                            title="View Invoice"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        {inv.status === "overdue" && (
                          <Link href="/recovery-queue">
                            <Button
                              variant="danger"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1"
                            >
                              <Send className="w-3 h-3" /> Remind
                            </Button>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-3.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {displayInvoices.length} of {rawInvoices.length} invoices
          </span>
          <Link
            href="/invoices"
            className="font-semibold text-slate-800 hover:text-slate-900 flex items-center gap-1"
          >
            View All Invoices <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
