"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  User,
  FileText,
  CreditCard,
  ReceiptText,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useFeePulse } from "@/lib/invoice-context";
import { formatINR } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export type SearchCategory = "ALL" | "STUDENTS" | "INVOICES" | "PAYMENTS" | "EXPENSES" | "PAGES";

export interface SearchResultItem {
  id: string;
  category: "STUDENTS" | "INVOICES" | "PAYMENTS" | "EXPENSES" | "PAGES";
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: "success" | "danger" | "warning" | "info" | "secondary";
  url: string;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const context = useFeePulse();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("ALL");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset state during render when isOpen changes (React-compliant pattern)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuery("");
      setActiveCategory("ALL");
      setSelectedIndex(0);
    }
  }

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Optional live Supabase records cache for multi-search
  const [dbStudents, setDbStudents] = useState<
    Array<{ id: string; name: string; grade_subject: string | null; parent_name: string | null }>
  >([]);
  const [dbInvoices, setDbInvoices] = useState<
    Array<{ id: string; invoice_number: string; total_amount: number; status: string; customer_id: string }>
  >([]);

  useEffect(() => {
    if (!isOpen) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: biz } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (biz?.id) {
        const [cRes, iRes] = await Promise.all([
          supabase
            .from("customers")
            .select("id, name, grade_subject, parent_name")
            .eq("business_id", biz.id)
            .limit(20),
          supabase
            .from("invoices")
            .select("id, invoice_number, total_amount, status, customer_id")
            .eq("business_id", biz.id)
            .limit(20),
        ]);
        if (cRes.data) setDbStudents(cRes.data);
        if (iRes.data) setDbInvoices(iRes.data);
      }
    });
  }, [isOpen]);

  // Static Navigation shortcuts
  const navigationPages: SearchResultItem[] = useMemo(
    () => [
      { id: "page-overview", category: "PAGES", title: "Cashflow Overview", subtitle: "Main business metrics, runway & alerts", url: "/" },
      { id: "page-students", category: "PAGES", title: "Students & Batches", subtitle: "Student roster, fee status & parent contacts", url: "/customers" },
      { id: "page-invoices", category: "PAGES", title: "Invoices & Fee Slips", subtitle: "Create, print and track student billings", url: "/invoices" },
      { id: "page-payments", category: "PAGES", title: "Fee Collections & Receipts", subtitle: "Payment history, settlement slips & UTR audit", url: "/payments" },
      { id: "page-expenses", category: "PAGES", title: "Operational Expenses", subtitle: "Rent, honorariums, power & utilities", url: "/expenses" },
      { id: "page-cashflow", category: "PAGES", title: "Cashflow Forecasting & Runway", subtitle: "Deterministic 30/60/90D roll-forward ledger", url: "/cashflow" },
      { id: "page-recovery", category: "PAGES", title: "Smart Recovery Queue", subtitle: "Prioritized overdue fees & promises to pay", url: "/recovery-queue" },
      { id: "page-ai", category: "PAGES", title: "AI Assistant & Document Scanner", subtitle: "Multimodal receipt and promise parser", url: "/ai-assistant" },
      { id: "page-settings", category: "PAGES", title: "Academy & Financial Settings", subtitle: "UPI details, billing grace, thresholds", url: "/settings" },
    ],
    []
  );

  // Consolidated Multi-Entity Search Pool
  const results: SearchResultItem[] = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items: SearchResultItem[] = [];

    // 1. Navigation Pages
    if (activeCategory === "ALL" || activeCategory === "PAGES") {
      navigationPages.forEach((page) => {
        if (!q || page.title.toLowerCase().includes(q) || (page.subtitle && page.subtitle.toLowerCase().includes(q))) {
          items.push(page);
        }
      });
    }

    // 2. Students & Batches
    if (activeCategory === "ALL" || activeCategory === "STUDENTS") {
      context.customers.forEach((c) => {
        if (
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.gradeSubject && c.gradeSubject.toLowerCase().includes(q)) ||
          (c.parentName && c.parentName.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
        ) {
          items.push({
            id: `cust-${c.id}`,
            category: "STUDENTS",
            title: c.name,
            subtitle: `${c.gradeSubject} • Parent: ${c.parentName || "—"} (${c.phone})`,
            badge: c.status === "archived" ? "Archived" : "Enrolled",
            badgeVariant: c.status === "archived" ? "secondary" : "info",
            url: `/customers?search=${encodeURIComponent(c.name)}`,
          });
        }
      });

      // From Supabase (deduped by name)
      dbStudents.forEach((c) => {
        if (!items.some((it) => it.title.toLowerCase() === c.name.toLowerCase())) {
          if (!q || c.name.toLowerCase().includes(q) || (c.grade_subject && c.grade_subject.toLowerCase().includes(q))) {
            items.push({
              id: `db-cust-${c.id}`,
              category: "STUDENTS",
              title: c.name,
              subtitle: `${c.grade_subject || "General Batch"} • Parent: ${c.parent_name || "—"}`,
              badge: "Enrolled",
              badgeVariant: "info",
              url: `/customers?search=${encodeURIComponent(c.name)}`,
            });
          }
        }
      });
    }

    // 3. Invoices & Fee Slips
    if (activeCategory === "ALL" || activeCategory === "INVOICES") {
      context.invoices.forEach((inv) => {
        if (!q || inv.invoiceNumber.toLowerCase().includes(q) || inv.customerName.toLowerCase().includes(q)) {
          const isOverdue = inv.status === "overdue" || (inv.balanceDue > 0 && inv.status !== "paid" && inv.status !== "draft");
          items.push({
            id: `inv-${inv.id}`,
            category: "INVOICES",
            title: `${inv.invoiceNumber} — ${inv.customerName}`,
            subtitle: `Total: ${formatINR(inv.totalAmount)} • Balance Due: ${formatINR(inv.balanceDue)}`,
            badge: inv.status.toUpperCase(),
            badgeVariant: isOverdue ? "danger" : inv.status === "paid" ? "success" : "warning",
            url: `/invoices?search=${encodeURIComponent(inv.invoiceNumber)}`,
          });
        }
      });

      dbInvoices.forEach((inv) => {
        if (!items.some((it) => it.title.startsWith(inv.invoice_number))) {
          if (!q || inv.invoice_number.toLowerCase().includes(q)) {
            items.push({
              id: `db-inv-${inv.id}`,
              category: "INVOICES",
              title: inv.invoice_number,
              subtitle: `Total Amount: ${formatINR(Number(inv.total_amount))}`,
              badge: inv.status.toUpperCase(),
              badgeVariant: inv.status === "paid" ? "success" : "info",
              url: `/invoices?search=${encodeURIComponent(inv.invoice_number)}`,
            });
          }
        }
      });
    }

    // 4. Receipts & Fee Collections
    if (activeCategory === "ALL" || activeCategory === "PAYMENTS") {
      context.payments.forEach((pay) => {
        const receiptNo = pay.receiptNumber || `REC-${pay.id}`;
        const student = pay.studentName || "Student";
        if (
          !q ||
          receiptNo.toLowerCase().includes(q) ||
          student.toLowerCase().includes(q) ||
          pay.invoiceNumber.toLowerCase().includes(q) ||
          (pay.referenceId && pay.referenceId.toLowerCase().includes(q))
        ) {
          items.push({
            id: `pay-${pay.id}`,
            category: "PAYMENTS",
            title: `${receiptNo} — ${student}`,
            subtitle: `${pay.paymentMode} • Ref: ${pay.referenceId || "Direct"} • Invoice: ${pay.invoiceNumber}`,
            badge: formatINR(pay.amount),
            badgeVariant: "success",
            url: `/payments?search=${encodeURIComponent(receiptNo)}`,
          });
        }
      });
    }

    // 5. Bills & Operational Expenses
    if (activeCategory === "ALL" || activeCategory === "EXPENSES") {
      context.bills.forEach((b) => {
        if (!q || b.title.toLowerCase().includes(q) || b.vendorName.toLowerCase().includes(q) || b.category.toLowerCase().includes(q)) {
          items.push({
            id: `bill-${b.id}`,
            category: "EXPENSES",
            title: b.title,
            subtitle: `${b.category} • ${b.vendorName} • Due: ${b.dueDate}`,
            badge: formatINR(b.amount),
            badgeVariant: b.status === "paid" ? "success" : b.status === "overdue" ? "danger" : "warning",
            url: `/expenses?search=${encodeURIComponent(b.title)}`,
          });
        }
      });
    }

    return items;
  }, [query, activeCategory, navigationPages, context, dbStudents, dbInvoices]);

  // Clamped index for keyboard navigation
  const clampedIndex = selectedIndex >= results.length ? 0 : selectedIndex;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < results.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, results.length - 1)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[clampedIndex]) {
        handleSelect(results[clampedIndex]);
      }
    }
  };

  const handleSelect = (item: SearchResultItem) => {
    onClose();
    router.push(item.url);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "STUDENTS":
        return <User className="w-4 h-4 text-sky-600" />;
      case "INVOICES":
        return <FileText className="w-4 h-4 text-emerald-600" />;
      case "PAYMENTS":
        return <ReceiptText className="w-4 h-4 text-teal-600" />;
      case "EXPENSES":
        return <CreditCard className="w-4 h-4 text-amber-600" />;
      case "PAGES":
      default:
        return <TrendingUp className="w-4 h-4 text-indigo-600" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 px-4 animate-in fade-in duration-150">
      <div
        ref={containerRef}
        className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 border-b border-slate-100 bg-white">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search students, invoices, receipts, bills, or pages... (e.g. 'Arjun', 'INV', 'Rent')"
            className="w-full h-14 text-sm text-slate-800 placeholder-slate-400 bg-transparent focus:outline-hidden font-medium"
          />

          {query && (
            <button
              onClick={() => {
                setQuery("");
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors mr-2 cursor-pointer"
              title="Clear search text"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
            ESC
          </div>
        </div>

        {/* Multi-Search Category Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 border-b border-slate-100 overflow-x-auto text-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 shrink-0">Search Scope:</span>
          {(
            [
              { id: "ALL", label: "All Results" },
              { id: "STUDENTS", label: "Students" },
              { id: "INVOICES", label: "Invoices" },
              { id: "PAYMENTS", label: "Receipts" },
              { id: "EXPENSES", label: "Bills & Expenses" },
              { id: "PAGES", label: "Pages" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveCategory(tab.id);
                setSelectedIndex(0);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                activeCategory === tab.id
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-50">
          {results.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No matching results found</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Try searching for student names, invoice numbers (e.g. &apos;INV-2026-&apos;), receipt numbers, or expense vendors.
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === clampedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? "bg-indigo-50/80 text-indigo-950 ring-1 ring-indigo-500/20 shadow-2xs"
                      : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-white shadow-2xs" : "bg-slate-100"
                      }`}
                    >
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate flex items-center gap-2">
                        <span>{item.title}</span>
                      </p>
                      {item.subtitle && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.badge && (
                      <Badge variant={item.badgeVariant || "secondary"} className="text-[10px] font-semibold">
                        {item.badge}
                      </Badge>
                    )}
                    <ArrowRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        isSelected ? "text-indigo-600 translate-x-0.5" : "text-slate-300"
                      }`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200 text-[10px]">↑↓</span> to navigate
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">↵</span> to select
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            {results.length} result{results.length === 1 ? "" : "s"} found
          </span>
        </div>
      </div>
    </div>
  );
}
