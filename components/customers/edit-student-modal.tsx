"use client";

import React, { useState } from "react";
import { X, Edit3, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateCustomerAction } from "@/app/actions/customers";
import { UpdateCustomerSchema, type CustomerRecord } from "@/lib/dal/customers";

interface EditStudentModalProps {
  isOpen: boolean;
  student: CustomerRecord | null;
  onClose: () => void;
  onStudentUpdated: (updatedStudent: CustomerRecord) => void;
}

const BATCH_OPTIONS = [
  "Grade 9 Foundation Science",
  "Grade 10 CBSE Full Batch",
  "Grade 10 ICSE Maths",
  "Grade 11 Mathematics",
  "Grade 11 Chemistry",
  "Grade 12 IIT JEE Advanced",
  "Grade 12 NEET Physics",
  "Custom Batch",
];

interface EditStudentFormProps {
  student: CustomerRecord;
  onClose: () => void;
  onStudentUpdated: (updatedStudent: CustomerRecord) => void;
}

function EditStudentForm({
  student,
  onClose,
  onStudentUpdated,
}: EditStudentFormProps) {
  const isCustomBatch = !BATCH_OPTIONS.includes(student.gradeSubject);
  const [name, setName] = useState(student.name);
  const [parentName, setParentName] = useState(student.parentName);
  const [phone, setPhone] = useState(student.phone);
  const [whatsappNumber, setWhatsappNumber] = useState(student.whatsappNumber);
  const [email, setEmail] = useState(student.email || "");
  const [gradeSubject, setGradeSubject] = useState(
    isCustomBatch ? "Custom Batch" : student.gradeSubject
  );
  const [customBatch, setCustomBatch] = useState(
    isCustomBatch ? student.gradeSubject : ""
  );
  const [defaultFeeAmount, setDefaultFeeAmount] = useState(
    String(student.defaultFeeAmount)
  );
  const [billingCycleDay, setBillingCycleDay] = useState(
    String(student.billingCycleDay)
  );
  const [status, setStatus] = useState<"active" | "inactive" | "archived">(
    student.status
  );
  const [notes, setNotes] = useState(student.notes || "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const finalBatch =
      gradeSubject === "Custom Batch"
        ? customBatch.trim() || "General Batch"
        : gradeSubject;

    const rawPayload = {
      name: name.trim(),
      parentName: parentName.trim(),
      gradeSubject: finalBatch,
      phone: phone.trim(),
      whatsappNumber: whatsappNumber.trim(),
      email: email.trim() || undefined,
      defaultFeeAmount: Number(defaultFeeAmount),
      billingCycleDay: Number(billingCycleDay),
      status,
      notes: notes.trim() || undefined,
    };

    const validation = UpdateCustomerSchema.safeParse(rawPayload);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const fieldName = issue.path[0] as string;
        if (!fieldErrors[fieldName]) {
          fieldErrors[fieldName] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const result = await updateCustomerAction(student.id, validation.data);
      if (!result.success) {
        setServerError(result.error);
        setIsSubmitting(false);
        return;
      }

      onStudentUpdated(result.data);
      onClose();
    } catch (err: unknown) {
      setServerError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while updating."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      {serverError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Student & Parent Identity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Student Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 ${
              errors.name
                ? "border-rose-300 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-200 focus:ring-slate-900"
            }`}
          />
          {errors.name && (
            <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" /> {errors.name}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Parent / Guardian Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 ${
              errors.parentName
                ? "border-rose-300 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-200 focus:ring-slate-900"
            }`}
          />
          {errors.parentName && (
            <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" /> {errors.parentName}
            </p>
          )}
        </div>
      </div>

      {/* Phone & WhatsApp Contacts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Mobile Phone <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 ${
              errors.phone
                ? "border-rose-300 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-200 focus:ring-slate-900"
            }`}
          />
          {errors.phone && (
            <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" /> {errors.phone}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            WhatsApp Number <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 ${
              errors.whatsappNumber
                ? "border-rose-300 focus:ring-rose-500 bg-rose-50/30"
                : "border-slate-200 focus:ring-slate-900"
            }`}
          />
          {errors.whatsappNumber && (
            <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" /> {errors.whatsappNumber}
            </p>
          )}
        </div>
      </div>

      {/* Email Address */}
      <div>
        <label className="text-xs font-semibold text-slate-700 block mb-1">
          Parent Email Address{" "}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        {errors.email && (
          <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" /> {errors.email}
          </p>
        )}
      </div>

      {/* Tuition Batch / Grade Selection */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700 block">
          Tuition Batch / Class <span className="text-rose-500">*</span>
        </label>
        <select
          value={gradeSubject}
          onChange={(e) => setGradeSubject(e.target.value)}
          className="w-full text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          {BATCH_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        {gradeSubject === "Custom Batch" && (
          <input
            type="text"
            placeholder="Type custom batch name..."
            value={customBatch}
            onChange={(e) => setCustomBatch(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        )}
      </div>

      {/* Financial Terms & Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Monthly Fee (₹) <span className="text-rose-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="100"
            value={defaultFeeAmount}
            onChange={(e) => setDefaultFeeAmount(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Cycle Day <span className="text-rose-500">*</span>
          </label>
          <select
            value={billingCycleDay}
            onChange={(e) => setBillingCycleDay(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                Day {day}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">
            Status <span className="text-rose-500">*</span>
          </label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "active" | "inactive" | "archived")
            }
            className="w-full text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-slate-700 block mb-1">
          Internal Notes{" "}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isSubmitting}
          className="text-xs"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Edit3 className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export function EditStudentModal({
  isOpen,
  student,
  onClose,
  onStudentUpdated,
}: EditStudentModalProps) {
  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/95 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Edit Student Details
              </h3>
              <p className="text-xs text-slate-500">
                Update tuition terms, phone numbers, or academic batch.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body - Keyed by student.id to reset state without useEffect */}
        <EditStudentForm
          key={student.id}
          student={student}
          onClose={onClose}
          onStudentUpdated={onStudentUpdated}
        />
      </div>
    </div>
  );
}
