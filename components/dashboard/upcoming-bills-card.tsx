"use client";

import React from "react";
import Link from "next/link";
import { Receipt, Calendar, ArrowUpRight, RefreshCw, AlertCircle, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR, formatDate } from "@/lib/formatters";
import { useBills } from "@/lib/invoice-context";
import type { BillRecord } from "@/lib/dal/bills";

export interface UpcomingBillsCardProps {
  bills?: BillRecord[];
}

export function UpcomingBillsCard(props: UpcomingBillsCardProps) {
  const fallbackContext = useBills();

  const rawBills = props.bills ?? fallbackContext.bills;
  const unpaidBills = rawBills.filter((b) => b.status !== "paid");
  const displayBills = unpaidBills.slice(0, 4);
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Card className="border-slate-200/90 shadow-sm flex flex-col justify-between overflow-hidden bg-white">
      <div>
        <CardHeader className="flex flex-row items-center justify-between pb-3 p-5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <Receipt className="w-4 h-4" />
            </div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Upcoming Bills &amp; Expenses
            </CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] text-slate-600 font-semibold tabular-nums">
            {unpaidBills.length} Overheads
          </Badge>
        </CardHeader>

        <CardContent className="p-5 pt-0 space-y-2.5">
          {displayBills.length === 0 ? (
            <div className="text-center py-8 px-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <Receipt className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-800">No pending expenses</p>
              <p className="text-xs text-slate-500">
                All coaching overheads and operational bills are fully settled.
              </p>
              <Link href="/expenses">
                <Button variant="outline" size="sm" className="text-xs mt-1 gap-1 font-semibold">
                  <Plus className="w-3 h-3" />
                  <span>Add Expense</span>
                </Button>
              </Link>
            </div>
          ) : (
            displayBills.map((bill) => {
              const isOverdue = bill.status === "overdue" || (bill.dueDate < todayStr && bill.status !== "paid");
              return (
                <div
                  key={bill.id}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 truncate">
                        {bill.title}
                      </span>
                      {bill.isRecurring && (
                        <span title="Recurring monthly bill">
                          <RefreshCw className="w-3 h-3 text-slate-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 font-medium">
                      <span>{bill.vendorName || "Operational"}</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-600">{bill.category}</span>
                      {isOverdue && (
                        <Badge variant="danger" className="text-[9px] py-0 px-1 ml-1 gap-0.5 font-semibold">
                          <AlertCircle className="w-2.5 h-2.5" /> Overdue
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatINR(bill.amount)}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1 tabular-nums font-medium">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{formatDate(bill.dueDate, "short")}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </div>

      <div className="p-3.5 bg-slate-50/70 border-t border-slate-100 text-xs flex items-center justify-between font-medium">
        <span className="text-slate-500">
          Total Unpaid: <strong className="text-slate-900 font-mono tabular-nums">{formatINR(totalUnpaid)}</strong>
        </span>
        <Link
          href="/expenses"
          className="font-bold text-slate-800 hover:text-slate-900 flex items-center gap-1 transition-colors"
        >
          Manage Expenses <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </Card>
  );
}
