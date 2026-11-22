"use client";

import React, { useState } from "react";
import { X, UserPlus, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCustomerAction } from "@/app/actions/customers";
import { CreateCustomerSchema, type CustomerRecord } from "@/lib/dal/customers";

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudentCreated: (newStudent: CustomerRecord) => void;
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

export function AddStudentModal({
  isOpen,
  onClose,
  onStudentCreated,
}: AddStudentModalProps) {
  const [name, setName] = useState("");
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [email, setEmail] = useState("");
  const [gradeSubject, setGradeSubject] = useState(BATCH_OPTIONS[1]);
  const [customBatch, setCustomBatch] = useState("");
  const [defaultFeeAmount, setDefaultFeeAmount] = useState("7500");
  const [billingCycleDay, setBillingCycleDay] = useState("1");
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPhone(val);
    if (sameAsPhone) {
      setWhatsappNumber(val);
    }
  };

  const handleSameAsPhoneToggle = (checked: boolean) => {
    setSameAsPhone(checked);
    if (checked) {
      setWhatsappNumber(phone);
    }
  };

  const resetForm = () => {
    setName("");
    setParentName("");
    setPhone("");
    setWhatsappNumber("");
    setEmail("");
    setGradeSubject(BATCH_OPTIONS[1]);
    setCustomBatch("");
    setDefaultFeeAmount("7500");
    setBillingCycleDay("1");
    setNotes("");
    setErrors({});
    setServerError(null);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

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
      notes: notes.trim() || undefined,
    };

    const validation = CreateCustomerSchema.safeParse(rawPayload);
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
      const result = await createCustomerAction(validation.data);
      if (!result.success) {
        setServerError(result.error);
        if (result.details) {
          const detailMap: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.details)) {
            detailMap[k] = v[0];
          }
          setErrors(detailMap);
        }
        setIsSubmitting(false);
        return;
      }

      onStudentCreated(result.data);
      resetForm();
      onClose();
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/95 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Enroll New Student
              </h3>
              <p className="text-xs text-slate-500">
                Add student to tuition roster with fee terms and parent contact.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
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
                placeholder="e.g. Aarav Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
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
                placeholder="e.g. Vikram Sharma"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
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
                Parent Mobile Phone <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                placeholder="e.g. 98201 54321"
                value={phone}
                onChange={handlePhoneChange}
                className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  WhatsApp Number <span className="text-rose-500">*</span>
                </label>
                <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsPhone}
                    onChange={(e) => handleSameAsPhoneToggle(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Same as phone</span>
                </label>
              </div>
              <input
                type="tel"
                placeholder="e.g. 98201 54321"
                value={whatsappNumber}
                disabled={sameAsPhone}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 ${
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
              Parent Email Address <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              placeholder="e.g. parent@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full text-xs rounded-lg border px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                errors.email
                  ? "border-rose-300 focus:ring-rose-500 bg-rose-50/30"
                  : "border-slate-200 focus:ring-slate-900"
              }`}
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
                placeholder="Type custom batch name (e.g. Grade 8 Olympiad Math)..."
                value={customBatch}
                onChange={(e) => setCustomBatch(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 animate-in fade-in duration-100"
              />
            )}
            {errors.gradeSubject && (
              <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> {errors.gradeSubject}
              </p>
            )}
          </div>

          {/* Financial Terms: Monthly Fee & Billing Day */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Monthly Fee (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-mono font-bold text-slate-500">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="7500"
                  value={defaultFeeAmount}
                  onChange={(e) => setDefaultFeeAmount(e.target.value)}
                  className={`w-full text-xs rounded-lg border bg-white pl-7 pr-3 py-2 font-mono font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
                    errors.defaultFeeAmount
                      ? "border-rose-300 focus:ring-rose-500"
                      : "border-slate-200 focus:ring-slate-900"
                  }`}
                />
              </div>
              {errors.defaultFeeAmount && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {errors.defaultFeeAmount}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Billing Cycle Day <span className="text-rose-500">*</span>
              </label>
              <select
                value={billingCycleDay}
                onChange={(e) => setBillingCycleDay(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                    {day === 1
                      ? "st"
                      : day === 2
                      ? "nd"
                      : day === 3
                      ? "rd"
                      : "th"}{" "}
                    of every month
                  </option>
                ))}
              </select>
              {errors.billingCycleDay && (
                <p className="text-[11px] text-rose-600 mt-1">
                  {errors.billingCycleDay}
                </p>
              )}
            </div>
          </div>

          {/* Academic / Personal Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Internal Academic & Fee Notes{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Joined mid-month. Parent requested reminders only on 1st weekend."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Enrolling...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Confirm Enrollment</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
