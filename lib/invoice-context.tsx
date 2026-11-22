"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  SampleInvoice,
  sampleRecentInvoices,
  SampleInvoiceStatus,
  SamplePayment,
  sampleRecentPayments,
  SampleCustomer,
  sampleCustomers,
  SampleBill,
  sampleUpcomingBills,
  SamplePaymentPromise,
  samplePaymentPromises,
  RecoveryFollowUp,
  sampleFollowUps,
} from "@/lib/sample-data";
import { validatePaymentCalculation } from "@/lib/finance/invoice-calculations";

export interface RecordPaymentParams {
  customerId: string;
  invoiceId: string;
  amount: number;
  paymentMode: "UPI" | "Net Banking" | "Cash" | "Cheque";
  referenceId?: string;
  paymentDate?: string;
  notes?: string;
}

export interface RecordPaymentResult {
  success: boolean;
  message: string;
  payment?: SamplePayment;
}

export interface InvoiceContextType {
  invoices: SampleInvoice[];
  payments: SamplePayment[];
  customers: SampleCustomer[];
  bills: SampleBill[];
  promises: SamplePaymentPromise[];
  followUps: RecoveryFollowUp[];
  addCustomer: (
    customer: Omit<
      SampleCustomer,
      "id" | "totalInvoiced" | "totalCollected" | "outstandingBalance" | "overdueCount" | "joinedDate"
    >
  ) => SampleCustomer;
  addInvoice: (invoice: Omit<SampleInvoice, "id">) => SampleInvoice;
  updateInvoice: (id: string, updates: Partial<SampleInvoice>) => boolean;
  transitionStatus: (id: string, newStatus: "sent" | "cancelled") => { success: boolean; message: string };
  getInvoice: (id: string) => SampleInvoice | undefined;
  generateNextInvoiceNumber: () => string;
  generateNextReceiptNumber: () => string;
  recordPayment: (params: RecordPaymentParams) => RecordPaymentResult;
  getPaymentsForInvoice: (invoiceNumberOrId: string) => SamplePayment[];
  getPaymentsForCustomer: (customerIdOrName: string) => SamplePayment[];
  addBill: (billData: Omit<SampleBill, "id" | "status">) => SampleBill;
  markBillAsPaid: (
    billId: string,
    paymentDetails: {
      paidDate: string;
      paymentMethod: "UPI" | "Net Banking" | "Cash" | "Cheque";
      paymentReference?: string;
      notes?: string;
    }
  ) => { success: boolean; message: string };
  addPromise: (promiseData: Omit<SamplePaymentPromise, "id">) => SamplePaymentPromise;
  updatePromiseStatus: (id: string, status: "pending" | "fulfilled" | "broken" | "cancelled") => void;
  addFollowUp: (followUpData: Omit<RecoveryFollowUp, "id" | "recordedAt">) => RecoveryFollowUp;
  isInvoicePartiallyPaid: (invoice: SampleInvoice) => boolean;
}

const InvoiceContext = createContext<InvoiceContextType | undefined>(undefined);

export function InvoiceProvider({ children }: { children: ReactNode }) {
  const [invoices, setInvoices] = useState<SampleInvoice[]>(sampleRecentInvoices);
  const [payments, setPayments] = useState<SamplePayment[]>(sampleRecentPayments);
  const [customers, setCustomers] = useState<SampleCustomer[]>(sampleCustomers);
  const [bills, setBills] = useState<SampleBill[]>(sampleUpcomingBills);
  const [promises, setPromises] = useState<SamplePaymentPromise[]>(samplePaymentPromises);
  const [followUps, setFollowUps] = useState<RecoveryFollowUp[]>(sampleFollowUps);

  const generateNextInvoiceNumber = () => {
    const existingNumbers = invoices
      .map((inv) => {
        const match = inv.invoiceNumber.match(/INV-2026-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));

    const highest = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 92;
    const nextNum = highest + 1;
    return `INV-2026-${String(nextNum).padStart(3, "0")}`;
  };

  const generateNextReceiptNumber = () => {
    const existingNumbers = payments
      .map((pay) => {
        const match = pay.receiptNumber?.match(/REC-2026-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));

    const highest = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 101;
    const nextNum = highest + 1;
    return `REC-2026-${String(nextNum).padStart(3, "0")}`;
  };

  const addCustomer = (
    customerData: Omit<
      SampleCustomer,
      "id" | "totalInvoiced" | "totalCollected" | "outstandingBalance" | "overdueCount" | "joinedDate"
    >
  ): SampleCustomer => {
    const newStudent: SampleCustomer = {
      ...customerData,
      id: `cust-${Date.now()}`,
      totalInvoiced: customerData.defaultFeeAmount,
      totalCollected: 0,
      outstandingBalance: customerData.defaultFeeAmount,
      overdueCount: 0,
      joinedDate: "2026-11-21",
    };
    setCustomers((prev) => [newStudent, ...prev]);
    return newStudent;
  };

  const addInvoice = (invoiceData: Omit<SampleInvoice, "id">): SampleInvoice => {
    const newInvoice: SampleInvoice = {
      ...invoiceData,
      id: `inv-${Date.now()}`,
    };
    setInvoices((prev) => [newInvoice, ...prev]);

    // Update customer totalInvoiced and outstandingBalance
    if (newInvoice.customerId) {
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id !== newInvoice.customerId) return c;
          const invoicedPaise = Math.round(c.totalInvoiced * 100) + Math.round(newInvoice.totalAmount * 100);
          const balancePaise = Math.round(c.outstandingBalance * 100) + Math.round(newInvoice.balanceDue * 100);
          return {
            ...c,
            totalInvoiced: invoicedPaise / 100,
            outstandingBalance: balancePaise / 100,
          };
        })
      );
    }

    return newInvoice;
  };

  const updateInvoice = (id: string, updates: Partial<SampleInvoice>): boolean => {
    let updated = false;
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== id) return inv;

        // Lifecycle immutability guard: Sent, overdue, paid or partially paid invoices cannot have financial details edited
        if (inv.status !== "draft") {
          const { notes, paymentTerms } = updates;
          updated = true;
          return {
            ...inv,
            ...(notes !== undefined ? { notes } : {}),
            ...(paymentTerms !== undefined ? { paymentTerms } : {}),
          };
        }

        updated = true;
        return {
          ...inv,
          ...updates,
        };
      })
    );
    return updated;
  };

  const transitionStatus = (
    id: string,
    newStatus: "sent" | "cancelled"
  ): { success: boolean; message: string } => {
    let result = { success: false, message: "Invoice not found." };

    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== id) return inv;

        if (newStatus === "sent") {
          if (inv.status !== "draft") {
            result = {
              success: false,
              message: `Only draft invoices can be marked as sent (current status: ${inv.status}).`,
            };
            return inv;
          }

          // Check if due date is already in the past
          const isOverdue = inv.dueDate < "2026-11-21";
          const resultingStatus: SampleInvoiceStatus = isOverdue ? "overdue" : "sent";

          result = {
            success: true,
            message: `Demo status transitioned: Invoice ${inv.invoiceNumber} marked as ${resultingStatus}. Financial amounts are now locked.`,
          };

          return {
            ...inv,
            status: resultingStatus,
          };
        }

        if (newStatus === "cancelled") {
          if (inv.amountPaid > 0) {
            result = {
              success: false,
              message: `Cannot cancel invoice with recorded payments totaling ₹${inv.amountPaid}.`,
            };
            return inv;
          }

          result = {
            success: true,
            message: `Demo status transitioned: Invoice ${inv.invoiceNumber} marked as cancelled.`,
          };

          return {
            ...inv,
            status: "draft" as SampleInvoiceStatus,
          };
        }

        return inv;
      })
    );

    return result;
  };

  const recordPayment = (params: RecordPaymentParams): RecordPaymentResult => {
    // 1. Locate Invoice
    const targetInvoice = invoices.find(
      (inv) => inv.id === params.invoiceId || inv.invoiceNumber === params.invoiceId
    );
    if (!targetInvoice) {
      return { success: false, message: "Specified invoice could not be found." };
    }

    // 2. Locate Customer
    const targetCustomer =
      customers.find((c) => c.id === params.customerId) ||
      customers.find((c) => c.id === targetInvoice.customerId) ||
      customers.find(
        (c) => c.name.toLowerCase() === targetInvoice.customerName.toLowerCase()
      );

    const effectiveCustomerId = targetCustomer?.id || params.customerId;

    // 3. Precision-safe validation & balance recalculation with overdue check
    const validation = validatePaymentCalculation(
      targetInvoice,
      effectiveCustomerId,
      params.amount,
      "2026-11-21"
    );

    if (!validation.isValid) {
      return { success: false, message: validation.error || "Payment validation failed." };
    }

    // 4. Generate unique demo receipt number
    const nextReceipt = generateNextReceiptNumber();
    const effectivePaymentDate = params.paymentDate || "2026-11-21";
    const paymentTimestamp = "Today, 4:15 PM";

    // 5. Construct atomic payment record
    const newPayment: SamplePayment = {
      id: `pay-${Date.now()}`,
      receiptNumber: nextReceipt,
      customerId: effectiveCustomerId,
      studentName: targetCustomer ? targetCustomer.name : targetInvoice.customerName,
      customerGrade: targetCustomer ? targetCustomer.gradeSubject : targetInvoice.customerGrade,
      parentName: targetCustomer?.parentName || targetInvoice.parentName || "Parent",
      parentPhone: targetCustomer?.phone || targetInvoice.parentPhone || "",
      amount: params.amount,
      paymentMode: params.paymentMode,
      referenceId:
        params.referenceId?.trim() ||
        (params.paymentMode === "Cash"
          ? `RCPT-CASH-${Math.floor(100 + Math.random() * 900)}`
          : `${params.paymentMode.toUpperCase().replace(/\s+/g, "")}/${Date.now().toString().slice(-8)}`),
      paidAt: paymentTimestamp,
      paymentDate: effectivePaymentDate,
      invoiceNumber: targetInvoice.invoiceNumber,
      invoiceId: targetInvoice.id,
      notes: params.notes?.trim() || undefined,
      previousBalance: targetInvoice.balanceDue,
      remainingBalance: validation.newBalanceDue ?? 0,
      status: "completed",
    };

    // 6. Perform atomic state transitions
    // a. Update Invoices
    const updatedInvoices = invoices.map((inv) => {
      if (inv.id !== targetInvoice.id) return inv;
      return {
        ...inv,
        amountPaid: validation.newAmountPaid!,
        balanceDue: validation.newBalanceDue!,
        status: validation.newStatus!,
        overdueDays: validation.newStatus === "paid" ? 0 : inv.overdueDays,
      };
    });
    setInvoices(updatedInvoices);

    // b. Prepend Payment to Payment Directory
    setPayments((prev) => [newPayment, ...prev]);

    // c. Mark linked pending promises as fulfilled
    setPromises((prev) =>
      prev.map((p) => {
        if (
          p.status === "pending" &&
          (p.invoiceId === targetInvoice.id || p.invoiceId === targetInvoice.invoiceNumber)
        ) {
          return { ...p, status: "fulfilled" as const };
        }
        return p;
      })
    );

    // d. Recalculate customer statistics dynamically from all invoices for that customer
    setCustomers((prev) =>
      prev.map((c) => {
        if (
          c.id !== effectiveCustomerId &&
          c.name.toLowerCase() !== targetInvoice.customerName.toLowerCase()
        ) {
          return c;
        }

        const custInvoices = updatedInvoices.filter(
          (inv) =>
            inv.customerId === c.id ||
            inv.customerName.toLowerCase() === c.name.toLowerCase()
        );

        const totalInvoiced = custInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
        const totalCollected = custInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
        const outstandingBalance = custInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
        const overdueCount = custInvoices.filter(
          (inv) => inv.status !== "draft" && inv.balanceDue > 0 && inv.dueDate < "2026-11-21"
        ).length;

        return {
          ...c,
          totalInvoiced,
          totalCollected,
          outstandingBalance,
          overdueCount,
        };
      })
    );

    return {
      success: true,
      message: `Demo Payment of ₹${params.amount.toLocaleString("en-IN")} recorded successfully for ${targetInvoice.customerName} on ${targetInvoice.invoiceNumber}. Receipt ${nextReceipt} generated.`,
      payment: newPayment,
    };
  };

  const getInvoice = (id: string) => {
    return invoices.find((inv) => inv.id === id || inv.invoiceNumber === id);
  };

  const getPaymentsForInvoice = (invoiceNumberOrId: string) => {
    return payments.filter(
      (p) => p.invoiceNumber === invoiceNumberOrId || p.invoiceId === invoiceNumberOrId
    );
  };

  const getPaymentsForCustomer = (customerIdOrName: string) => {
    return payments.filter(
      (p) =>
        p.customerId === customerIdOrName ||
        p.studentName.toLowerCase() === customerIdOrName.toLowerCase()
    );
  };

  const addBill = (billData: Omit<SampleBill, "id" | "status">): SampleBill => {
    const isOverdue = billData.dueDate < "2026-11-21";
    const newBill: SampleBill = {
      ...billData,
      id: `bill-${Date.now()}`,
      status: isOverdue ? "overdue" : "unpaid",
    };
    setBills((prev) => [newBill, ...prev]);
    return newBill;
  };

  const markBillAsPaid = (
    billId: string,
    paymentDetails: {
      paidDate: string;
      paymentMethod: "UPI" | "Net Banking" | "Cash" | "Cheque";
      paymentReference?: string;
      notes?: string;
    }
  ): { success: boolean; message: string } => {
    let found = false;
    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== billId) return b;
        found = true;
        return {
          ...b,
          status: "paid",
          paidDate: paymentDetails.paidDate || "2026-11-21",
          paymentMethod: paymentDetails.paymentMethod,
          paymentReference:
            paymentDetails.paymentReference?.trim() ||
            (paymentDetails.paymentMethod === "Cash"
              ? `RCPT-CASH-${Math.floor(100 + Math.random() * 900)}`
              : `TXN-${Date.now().toString().slice(-8)}`),
          notes: paymentDetails.notes?.trim() || b.notes,
        };
      })
    );

    if (!found) {
      return { success: false, message: "Bill not found." };
    }
    return { success: true, message: "Bill marked as paid and moved to expense history." };
  };

  const isInvoicePartiallyPaid = (invoice: SampleInvoice): boolean => {
    return invoice.amountPaid > 0 && invoice.balanceDue > 0;
  };

  const addPromise = (promiseData: Omit<SamplePaymentPromise, "id">): SamplePaymentPromise => {
    const newPromise: SamplePaymentPromise = {
      ...promiseData,
      id: `prm-${Date.now()}`,
    };
    setPromises((prev) => [newPromise, ...prev]);
    return newPromise;
  };

  const updatePromiseStatus = (
    id: string,
    status: "pending" | "fulfilled" | "broken" | "cancelled"
  ) => {
    setPromises((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p))
    );
  };

  const addFollowUp = (
    followUpData: Omit<RecoveryFollowUp, "id" | "recordedAt">
  ): RecoveryFollowUp => {
    const newFollowUp: RecoveryFollowUp = {
      ...followUpData,
      id: `fup-${Date.now()}`,
      recordedAt: "Just now",
    };
    setFollowUps((prev) => [newFollowUp, ...prev]);
    return newFollowUp;
  };

  return (
    <InvoiceContext.Provider
      value={{
        invoices,
        payments,
        customers,
        bills,
        promises,
        followUps,
        addCustomer,
        addInvoice,
        updateInvoice,
        transitionStatus,
        getInvoice,
        generateNextInvoiceNumber,
        generateNextReceiptNumber,
        recordPayment,
        getPaymentsForInvoice,
        getPaymentsForCustomer,
        addBill,
        markBillAsPaid,
        addPromise,
        updatePromiseStatus,
        addFollowUp,
        isInvoicePartiallyPaid,
      }}
    >
      {children}
    </InvoiceContext.Provider>
  );
}

export function useInvoices() {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error("useInvoices must be used within an InvoiceProvider");
  }
  return context;
}

export function usePayments() {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error("usePayments must be used within an InvoiceProvider");
  }
  return {
    payments: context.payments,
    invoices: context.invoices,
    customers: context.customers,
    recordPayment: context.recordPayment,
    generateNextReceiptNumber: context.generateNextReceiptNumber,
    getPaymentsForInvoice: context.getPaymentsForInvoice,
    getPaymentsForCustomer: context.getPaymentsForCustomer,
  };
}

export function useBills() {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error("useBills must be used within an InvoiceProvider");
  }
  return {
    bills: context.bills,
    addBill: context.addBill,
    markBillAsPaid: context.markBillAsPaid,
  };
}

export function useCashflow() {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error("useCashflow must be used within an InvoiceProvider");
  }
  return {
    invoices: context.invoices,
    bills: context.bills,
    customers: context.customers,
    promises: context.promises,
    addPromise: context.addPromise,
    updatePromiseStatus: context.updatePromiseStatus,
  };
}

export function useRecoveryQueue() {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error("useRecoveryQueue must be used within an InvoiceProvider");
  }
  return {
    customers: context.customers,
    invoices: context.invoices,
    promises: context.promises,
    payments: context.payments,
    followUps: context.followUps,
    addFollowUp: context.addFollowUp,
    addPromise: context.addPromise,
    updatePromiseStatus: context.updatePromiseStatus,
    recordPayment: context.recordPayment,
  };
}

export function useFeePulse() {
  const context = useContext(InvoiceContext);
  if (!context) {
    throw new Error("useFeePulse must be used within an InvoiceProvider");
  }
  return context;
}
