"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomersSummaryCards } from "@/components/customers/customers-summary-cards";
import { CustomerDirectoryTable } from "@/components/customers/customer-directory-table";
import { AddStudentModal } from "@/components/customers/add-student-modal";
import { EditStudentModal } from "@/components/customers/edit-student-modal";
import { StudentProfileDrawer } from "@/components/customers/student-profile-drawer";
import type { CustomerRecord } from "@/lib/dal/customers";

interface CustomersClientViewProps {
  initialCustomers: CustomerRecord[];
  businessName: string;
  initialSearch?: string;
}

export function CustomersClientView({
  initialCustomers,
  businessName,
  initialSearch = "",
}: CustomersClientViewProps) {
  const [customers, setCustomers] = useState<CustomerRecord[]>(initialCustomers);
  const [selectedStudent, setSelectedStudent] = useState<CustomerRecord | null>(null);
  const [editingStudent, setEditingStudent] = useState<CustomerRecord | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleStudentCreated = (newStudent: CustomerRecord) => {
    setCustomers((prev) => [newStudent, ...prev]);
    showToast(`Successfully enrolled ${newStudent.name} in ${newStudent.gradeSubject}`);
  };

  const handleStudentUpdated = (updatedStudent: CustomerRecord) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === updatedStudent.id ? updatedStudent : c))
    );
    if (selectedStudent?.id === updatedStudent.id) {
      setSelectedStudent(updatedStudent);
    }
    showToast(`Updated details for ${updatedStudent.name}`);
  };

  const handleArchiveStudent = (archivedStudent: CustomerRecord) => {
    setCustomers((prev) => prev.filter((c) => c.id !== archivedStudent.id));
    if (selectedStudent?.id === archivedStudent.id) {
      setSelectedStudent(null);
    }
    showToast(`Archived ${archivedStudent.name}. Financial audit history preserved.`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
            </Link>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs font-semibold text-slate-600">Students Directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            Student & Customer Roster
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage tuition batches, parent contact channels, fee structures, and outstanding receivables for{" "}
            <span className="font-semibold text-slate-800">{businessName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddModalOpen(true)}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-2xs"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Enroll New Student</span>
          </Button>
        </div>
      </div>

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between shadow-2xs animate-in slide-in-from-top-2 duration-150 ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-600 hover:text-slate-900 text-xs font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <section aria-label="Customer Summary">
        <CustomersSummaryCards customers={customers} />
      </section>

      {/* Directory Table with Search, Filter & Sort */}
      <section aria-label="Student Directory">
        <CustomerDirectoryTable
          customers={customers}
          onSelectStudent={(student) => setSelectedStudent(student)}
          onOpenAddStudent={() => setIsAddModalOpen(true)}
          onEditStudent={(student) => setEditingStudent(student)}
          initialSearch={initialSearch}
        />
      </section>

      {/* Add Student Modal */}
      <AddStudentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onStudentCreated={handleStudentCreated}
      />

      {/* Edit Student Modal */}
      <EditStudentModal
        isOpen={!!editingStudent}
        student={editingStudent}
        onClose={() => setEditingStudent(null)}
        onStudentUpdated={handleStudentUpdated}
      />

      {/* Detailed Student Profile Slide-Over Drawer */}
      <StudentProfileDrawer
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
        onActionFeedback={(msg) => showToast(msg)}
        onEditStudent={(student) => {
          setEditingStudent(student);
        }}
        onArchiveStudent={handleArchiveStudent}
      />
    </div>
  );
}
