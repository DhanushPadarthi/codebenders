import React from "react";
import { Users, UserCheck, AlertCircle, IndianRupee } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/formatters";
import type { CustomerRecord } from "@/lib/dal/customers";

interface CustomersSummaryCardsProps {
  customers: CustomerRecord[];
}

export function CustomersSummaryCards({ customers }: CustomersSummaryCardsProps) {
  const totalStudents = customers.length;
  const activeStudents = customers.filter((c) => c.status === "active").length;
  const overdueStudents = customers.filter(
    (c) => c.outstandingBalance > 0 && c.overdueCount > 0
  ).length;

  // Use integer paise summation to avoid floating point precision issues
  const totalOutstandingPaise = customers.reduce(
    (sum, c) => sum + Math.round((c.outstandingBalance || 0) * 100),
    0
  );
  const totalOutstanding = totalOutstandingPaise / 100;

  const uniqueBatches = new Set(
    customers.map((c) => c.gradeSubject).filter(Boolean)
  ).size;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Students */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-sm transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Enrolled
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Users className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
            {totalStudents} {totalStudents === 1 ? "Student" : "Students"}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {uniqueBatches > 0
              ? `Across ${uniqueBatches} ${uniqueBatches === 1 ? "batch" : "batches"}`
              : "No batches active yet"}
          </p>
        </CardContent>
      </Card>

      {/* Active Students */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-sm transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Roster
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <UserCheck className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-700 font-mono">
            {activeStudents} Active
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {totalStudents - activeStudents > 0
              ? `${totalStudents - activeStudents} inactive or archived`
              : "100% active attendance"}
          </p>
        </CardContent>
      </Card>

      {/* Overdue Accounts */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-sm transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Overdue Accounts
            </span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
              <AlertCircle className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-rose-600 font-mono">
            {overdueStudents} {overdueStudents === 1 ? "Account" : "Accounts"}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {overdueStudents > 0
              ? "Requires follow-up action"
              : "No accounts past due"}
          </p>
        </CardContent>
      </Card>

      {/* Total Outstanding */}
      <Card className="border-slate-200/90 shadow-2xs hover:shadow-sm transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Outstanding Fees
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <IndianRupee className="w-4 h-4 stroke-[2.2]" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
            {formatINR(totalOutstanding)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {totalOutstanding > 0
              ? "Pending fee receivables"
              : "All fee dues cleared"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
