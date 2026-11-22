"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Plus,
  ArrowUpDown,
  Filter,
  Users,
  ChevronRight,
  Phone,
  CheckCircle2,
  Edit3,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatINR, formatDate } from "@/lib/formatters";
import type { CustomerRecord } from "@/lib/dal/customers";

interface CustomerDirectoryTableProps {
  customers: CustomerRecord[];
  onSelectStudent: (student: CustomerRecord) => void;
  onOpenAddStudent: () => void;
  onEditStudent?: (student: CustomerRecord) => void;
  initialSearch?: string;
}

export function CustomerDirectoryTable({
  customers,
  onSelectStudent,
  onOpenAddStudent,
  onEditStudent,
  initialSearch = "",
}: CustomerDirectoryTableProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "overdue" | "archived">("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "fee_desc" | "outstanding_desc" | "due_date">("name");
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    if (initialSearch) {
      setSearchQuery(initialSearch);
    }
  }

  // Derive unique batches for dropdown
  const uniqueBatches = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.gradeSubject) set.add(c.gradeSubject);
    });
    return Array.from(set);
  }, [customers]);

  // Filter and sort students
  const filteredStudents = useMemo(() => {
    return customers
      .filter((student) => {
        // Status filter
        if (statusFilter === "active" && student.status !== "active") return false;
        if (statusFilter === "archived" && student.status !== "archived") return false;
        if (statusFilter === "overdue" && (student.outstandingBalance <= 0 || student.overdueCount <= 0)) {
          return false;
        }

        // Batch filter
        if (batchFilter !== "all" && student.gradeSubject !== batchFilter) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = student.name.toLowerCase().includes(q);
          const matchParent = student.parentName.toLowerCase().includes(q);
          const matchPhone = student.phone.includes(q) || student.whatsappNumber.includes(q);
          const matchBatch = student.gradeSubject.toLowerCase().includes(q);
          return matchName || matchParent || matchPhone || matchBatch;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === "fee_desc") {
          return b.defaultFeeAmount - a.defaultFeeAmount;
        }
        if (sortBy === "outstanding_desc") {
          return b.outstandingBalance - a.outstandingBalance;
        }
        if (sortBy === "due_date") {
          return a.nextPaymentDate.localeCompare(b.nextPaymentDate);
        }
        return 0;
      });
  }, [customers, statusFilter, batchFilter, searchQuery, sortBy]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setBatchFilter("all");
    setSortBy("name");
  };

  return (
    <Card className="border-slate-200/90 shadow-sm overflow-hidden bg-white">
      <CardHeader className="p-5 pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-slate-100 text-slate-700">
              <Users className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">
              Enrolled Students Directory
            </CardTitle>
          </div>
          <CardDescription className="mt-0.5">
            Manage tuition rosters, fee structures, parent communication, and payment tracking.
          </CardDescription>
        </div>

        <Button
          onClick={onOpenAddStudent}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 self-start md:self-auto shadow-xs"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Student</span>
        </Button>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {/* Controls Bar: Search, Status tabs, Batch filter, and Sort */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student, parent name, or mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200/90 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Filter Pills & Selectors */}
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
                All ({customers.length})
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === "active"
                    ? "bg-white text-emerald-800 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Active ({customers.filter((c) => c.status === "active").length})
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
                  customers.filter(
                    (c) => c.outstandingBalance > 0 && c.overdueCount > 0
                  ).length
                }
                )
              </button>
              <button
                onClick={() => setStatusFilter("archived")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  statusFilter === "archived"
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Archived ({customers.filter((c) => c.status === "archived").length})
              </button>
            </div>

            {/* Batch Filter Dropdown */}
            {uniqueBatches.length > 0 && (
              <div className="relative">
                <select
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  className="text-xs rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold cursor-pointer shadow-2xs"
                >
                  <option value="all">All Batches</option>
                  {uniqueBatches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 border border-slate-200/90 rounded-xl px-3 py-2 bg-white text-slate-700 shadow-2xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as "name" | "fee_desc" | "outstanding_desc" | "due_date"
                  )
                }
                className="text-xs bg-transparent focus:outline-hidden text-slate-700 cursor-pointer font-semibold"
              >
                <option value="name">Name (A-Z)</option>
                <option value="fee_desc">Highest Monthly Fee</option>
                <option value="outstanding_desc">Highest Outstanding</option>
                <option value="due_date">Upcoming Due Date</option>
              </select>
            </div>

            {(searchQuery || statusFilter !== "all" || batchFilter !== "all" || sortBy !== "name") && (
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

        {/* Table View */}
        <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Student &amp; Batch</th>
                <th className="py-3 px-4">Parent Contact</th>
                <th className="py-3 px-4 text-right">Monthly Fee</th>
                <th className="py-3 px-4 text-right">Outstanding</th>
                <th className="py-3 px-4 hidden sm:table-cell">Next Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        No students enrolled yet
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Start building your tuition roster. Add your first student to configure fee schedules, track payments, and send WhatsApp receipts.
                      </p>
                      <div className="pt-2">
                        <Button
                          onClick={onOpenAddStudent}
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Enroll Your First Student</span>
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="space-y-2">
                      <Filter className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                      <p className="font-bold text-slate-800">
                        No students match your active filters
                      </p>
                      <p className="text-slate-500 text-[11px]">
                        Try searching with a different term or clearing your status filters.
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
                filteredStudents.map((student) => {
                  const isOverdue =
                    student.outstandingBalance > 0 && student.overdueCount > 0;
                  const isArchived = student.status === "archived";

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => onSelectStudent(student)}
                    >
                      {/* Student Name & Batch */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            {student.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block group-hover:text-indigo-600 transition-colors">
                              {student.name}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              {student.gradeSubject}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Parent & Contact */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 block">
                          {student.parentName}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 font-medium">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{student.phone}</span>
                        </div>
                      </td>

                      {/* Monthly Fee */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {formatINR(student.defaultFeeAmount)}
                        </span>
                        <span className="text-[10px] text-slate-500 block font-medium">
                          Due day {student.billingCycleDay}
                        </span>
                      </td>

                      {/* Outstanding Balance */}
                      <td className="py-3.5 px-4 text-right">
                        {student.outstandingBalance > 0 ? (
                          <span className="font-mono font-bold text-rose-600 tabular-nums">
                            {formatINR(student.outstandingBalance)}
                          </span>
                        ) : (
                          <span className="font-mono text-emerald-600 font-semibold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Clear
                          </span>
                        )}
                      </td>

                      {/* Next Payment */}
                      <td className="py-3.5 px-4 hidden sm:table-cell tabular-nums">
                        <span
                          className={
                            isOverdue
                              ? "font-bold text-rose-600 text-[11px]"
                              : "text-slate-600 text-[11px] font-medium"
                          }
                        >
                          {student.nextPaymentDate !== "—"
                            ? formatDate(student.nextPaymentDate, "short")
                            : "—"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isArchived ? (
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            Archived
                          </Badge>
                        ) : isOverdue ? (
                          <Badge variant="danger" className="text-[10px] font-semibold">
                            Overdue
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px] font-semibold">
                            Active
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onEditStudent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                              title="Edit Student"
                              onClick={() => onEditStudent(student)}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs text-slate-600 hover:text-slate-900 gap-1 font-semibold"
                            onClick={() => onSelectStudent(student)}
                          >
                            <span>Profile</span>
                            <ChevronRight className="w-3.5 h-3.5" />
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
        {customers.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-500 font-medium">
            <span className="tabular-nums">
              Showing <strong className="text-slate-800 font-bold">{filteredStudents.length}</strong> of{" "}
              <strong className="text-slate-800 font-bold">{customers.length}</strong> students
            </span>
            <span className="text-[11px] text-slate-400">
              Click any student row to view tuition terms, contact channels, and payment history.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
