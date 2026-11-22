"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  LineChart,
  Receipt,
  ListTodo,
  Sparkles,
  Settings,
  SlidersHorizontal,
  X,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TourStep {
  id: string;
  title: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  route: string;
  whatItDoes: string;
  whereToFind: string;
  whatToExpect: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard",
    title: "1. Financial Dashboard & Health Cockpit",
    category: "Financial Overview",
    icon: LayoutDashboard,
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
    route: "/",
    whatItDoes:
      "Gives independent educators a real-time financial overview tracking total outstanding fees, overdue amounts, this month's collections, and upcoming overheads.",
    whereToFind: "Click 'Overview' in the sidebar or click the FeePulse logo anytime.",
    whatToExpect:
      "Instant KPI cards, a 30-day roll-forward cashflow graph, and Smart Action Center highlighting priority collections.",
  },
  {
    id: "customers",
    title: "2. Students & Tuition Batches",
    category: "Student Directory",
    icon: Users,
    iconColor: "text-sky-600",
    iconBg: "bg-sky-50",
    route: "/customers",
    whatItDoes:
      "Manage student roster, parent contact details, monthly fee agreements, batch/grade tags, and historical payments.",
    whereToFind: "Click 'Customers' in the sidebar navigation.",
    whatToExpect:
      "Full student directory with search, batch filters, fee balances, parent phone numbers, and profile slide-out drawer.",
  },
  {
    id: "invoices",
    title: "3. Invoices & Fee Slips",
    category: "Billing & Invoicing",
    icon: FileText,
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
    route: "/invoices",
    whatItDoes:
      "Generate monthly tuition fee slips with line items, issue draft/sent invoices, track remaining balances, and print slips.",
    whereToFind: "Click 'Invoices' in the sidebar or the '+ Create Invoice' button in the navbar.",
    whatToExpect:
      "Multi-item invoice creation, status tracking (draft, sent, partially paid, paid, overdue), and clean printable PDF-ready slips.",
  },
  {
    id: "payments",
    title: "4. Fee Collections & Receipts",
    category: "Payment Ledger",
    icon: CreditCard,
    iconColor: "text-teal-600",
    iconBg: "bg-teal-50",
    route: "/payments",
    whatItDoes:
      "Record full and partial fee payments via UPI, Cash, Cheque, or Bank Transfer with atomic balance updates and idempotent duplicate detection.",
    whereToFind: "Click 'Payments' in the sidebar or 'Record Payment' from the action bar.",
    whatToExpect:
      "Payment ledger with UTR reference verification, balance updates, and professional printable receipts with academy details.",
  },
  {
    id: "expenses",
    title: "5. Operational Expenses & Overheads",
    category: "Overheads Management",
    icon: Receipt,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
    route: "/expenses",
    whatItDoes:
      "Track fixed coaching rent, assistant teacher salaries, electricity, and exam materials so fixed deadlines never catch you off-guard.",
    whereToFind: "Click 'Bills & Expenses' in the sidebar navigation.",
    whatToExpect:
      "Upcoming and overdue bill tracking with settlement status, recurring overhead frequencies, and cash outflow projections.",
  },
  {
    id: "cashflow",
    title: "6. Cashflow Forecasting & Runway",
    category: "Runway Forecasting",
    icon: LineChart,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
    route: "/cashflow",
    whatItDoes:
      "Deterministic 30, 60, and 90-day cash roll-forward combining expected fee collections, confirmed promises, and scheduled bills.",
    whereToFind: "Click 'Cashflow' in the sidebar navigation.",
    whatToExpect:
      "Interactive daily balance charts, deficit date warnings, and working capital buffer projections.",
  },
  {
    id: "simulator",
    title: "7. What-If Scenario Simulator",
    category: "Stress-Testing Sandbox",
    icon: SlidersHorizontal,
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50",
    route: "/cashflow",
    whatItDoes:
      "Simulate collection delays (e.g. 20% delayed payments) or unexpected repair expenses to observe how your cash runway reacts.",
    whereToFind: "Located within the 'Scenario Simulator' tab on the Cashflow page.",
    whatToExpect:
      "Real-time comparative projection lines contrasting your baseline plan against the simulated liquidity scenario.",
  },
  {
    id: "recovery",
    title: "8. Smart Recovery Queue",
    category: "Overdue Collections",
    icon: ListTodo,
    iconColor: "text-rose-600",
    iconBg: "bg-rose-50",
    route: "/recovery-queue",
    whatItDoes:
      "Intelligently ranks overdue accounts by urgency score (factoring in days overdue, balance amount, and broken payment promises).",
    whereToFind: "Click 'Recovery Queue' in the sidebar navigation.",
    whatToExpect:
      "Prioritized student follow-up table, promise status tracking, and 1-click pre-filled WhatsApp reminder drafts.",
  },
  {
    id: "ai",
    title: "9. AI Assistant & Document Scanner",
    category: "AI Copilot",
    icon: Sparkles,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
    route: "/ai-assistant",
    whatItDoes:
      "Multimodal document extraction for bills and payment screenshots, unstructured WhatsApp promise parsing, and multi-tone reminder drafting.",
    whereToFind: "Click 'AI Assistant' in the sidebar navigation.",
    whatToExpect:
      "Zero-hallucination guardrails where AI outputs require explicit human confirmation before mutating any financial records.",
  },
  {
    id: "settings",
    title: "10. Academy & Financial Settings",
    category: "Configuration",
    icon: Settings,
    iconColor: "text-slate-700",
    iconBg: "bg-slate-100",
    route: "/settings",
    whatItDoes:
      "Configure academy name, UPI ID for student fee payments, invoice numbering prefixes, and cash reserve targets.",
    whereToFind: "Click 'Settings' in the sidebar navigation.",
    whatToExpect:
      "Real-time persistence of academy profile, payment instructions, and business parameters.",
  },
];

export function WelcomeWalkthrough() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // Check if user has seen onboarding or if opened via event
  useEffect(() => {
    const handleOpenEvent = () => {
      setActiveStepIndex(0);
      setIsOpen(true);
    };

    window.addEventListener("feepulse:open_tour", handleOpenEvent);

    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const isTourParam = urlParams.get("tour") === "true";
      const hasCompleted = localStorage.getItem("feepulse_onboarding_completed");

      // Auto-open on first visit or if tour=true
      if (!hasCompleted || isTourParam) {
        const timer = setTimeout(() => setIsOpen(true), 600);
        return () => {
          clearTimeout(timer);
          window.removeEventListener("feepulse:open_tour", handleOpenEvent);
        };
      }
    }

    return () => window.removeEventListener("feepulse:open_tour", handleOpenEvent);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("feepulse_onboarding_completed", "true");
    }
  };

  const handleNext = () => {
    if (activeStepIndex < TOUR_STEPS.length - 1) {
      setActiveStepIndex((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex((prev) => prev - 1);
    }
  };

  const handleJumpToRoute = (route: string) => {
    handleClose();
    router.push(route);
  };

  if (!isOpen) return null;

  const currentStep = TOUR_STEPS[activeStepIndex];
  const StepIcon = currentStep.icon;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
      {/* DESKTOP MODAL (md and up) */}
      <div className="hidden md:flex flex-col w-full max-w-3xl bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Welcome to FeePulse
                <Badge variant="success" className="text-[10px] py-0 px-2 font-semibold">
                  Demo Guide
                </Badge>
              </h2>
              <p className="text-xs text-slate-500">
                AI Cashflow Copilot for independent tutors & coaching academies
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Steps Grid + Right Feature Detail */}
        <div className="grid grid-cols-12 divide-x divide-slate-100 min-h-[380px]">
          {/* Step Selector Sidebar */}
          <div className="col-span-4 p-3 bg-slate-50/70 space-y-1 overflow-y-auto max-h-[420px]">
            <p className="text-[10px] uppercase font-bold text-slate-400 px-2.5 py-1 tracking-wider">
              10 Core Capabilities
            </p>
            {TOUR_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isSelected = idx === activeStepIndex;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white text-slate-900 shadow-2xs border border-slate-200/90 font-bold"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${step.iconBg}`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${step.iconColor}`} />
                  </div>
                  <span className="truncate">{step.title.replace(/^\d+\.\s*/, "")}</span>
                </button>
              );
            })}
          </div>

          {/* Active Step Details */}
          <div className="col-span-8 p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Step {activeStepIndex + 1} of {TOUR_STEPS.length} • {currentStep.category}
                </span>
                <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 font-semibold">
                  {currentStep.route}
                </span>
              </div>

              <div className="flex items-start gap-3.5 mb-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${currentStep.iconBg}`}
                >
                  <StepIcon className={`w-6 h-6 ${currentStep.iconColor} stroke-[2.2]`} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{currentStep.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {currentStep.whatItDoes}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block text-[11px]">📍 Where to find it:</span>
                  <p className="text-slate-600 mt-0.5">{currentStep.whereToFind}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-700 block text-[11px]">✨ What to expect:</span>
                  <p className="text-slate-600 mt-0.5">{currentStep.whatToExpect}</p>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-5 border-t border-slate-100 mt-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleJumpToRoute(currentStep.route)}
                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 gap-1.5 text-xs font-semibold cursor-pointer"
              >
                Jump to {currentStep.title.replace(/^\d+\.\s*/, "")}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={activeStepIndex === 0}
                  className="gap-1 text-xs font-semibold cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Prev
                </Button>
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {activeStepIndex === TOUR_STEPS.length - 1 ? (
                    <>
                      Start Exploring
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM SHEET (under md) */}
      <div className="md:hidden w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-4 animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${currentStep.iconBg}`}>
              <StepIcon className={`w-4 h-4 ${currentStep.iconColor}`} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 truncate max-w-[200px]">
                {currentStep.title}
              </p>
              <p className="text-[10px] text-slate-400">
                Step {activeStepIndex + 1} of {TOUR_STEPS.length}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
            aria-label="Dismiss tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-3 text-xs space-y-2">
          <p className="text-slate-700 leading-relaxed font-medium">
            {currentStep.whatItDoes}
          </p>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] space-y-1.5">
            <div>
              <span className="font-bold text-slate-600">Where: </span>
              <span className="text-slate-500">{currentStep.whereToFind}</span>
            </div>
            <div>
              <span className="font-bold text-slate-600">Expect: </span>
              <span className="text-slate-500">{currentStep.whatToExpect}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Skip Tour
          </Button>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={activeStepIndex === 0}
              className="px-2.5 text-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={handleNext}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3"
            >
              {activeStepIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Trigger button that can be embedded anywhere to reopen the guide.
 */
export function TourGuideButton({ className }: { className?: string }) {
  const handleOpen = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("feepulse:open_tour"));
    }
  };

  return (
    <button
      onClick={handleOpen}
      className={
        className ||
        "flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
      }
      title="Open Product Tour & Feature Guide"
    >
      <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
      <span>Feature Guide</span>
    </button>
  );
}
