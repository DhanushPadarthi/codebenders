"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Plus,
  Search,
  Building2,
  ChevronDown,
  Menu,
  CalendarDays,
  CheckCircle2,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sampleBusiness, sampleBranches } from "@/lib/sample-data";
import { createClient } from "@/lib/supabase/client";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getServerSnapshot() {
  return "Saturday, 21 Nov 2026";
}

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onCreateInvoiceClick?: () => void;
}

export function Header({ onOpenMobileMenu, onCreateInvoiceClick }: HeaderProps) {
  const router = useRouter();
  const [selectedBranch, setSelectedBranch] = useState(sampleBranches[0].name);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
  const todayFormatted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({
          email: data.user.email,
          full_name: (data.user.user_metadata?.full_name as string) || data.user.email?.split("@")[0],
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email,
          full_name: (session.user.user_metadata?.full_name as string) || session.user.email?.split("@")[0],
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-xs">
      {/* Left: Mobile Trigger & Business Switcher */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Business Branch Selector */}
        <div className="relative">
          <button
            onClick={() => setShowBranchMenu(!showBranchMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium transition-colors"
          >
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="max-w-[170px] sm:max-w-[240px] truncate font-semibold">
              {selectedBranch}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showBranchMenu && (
            <div className="absolute left-0 mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Select Tuition Centre / Batch
              </div>
              {sampleBranches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => {
                    setSelectedBranch(branch.name);
                    setShowBranchMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between"
                >
                  <span className="truncate">{branch.name}</span>
                  {selectedBranch === branch.name && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current Date Badge (Desktop) */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 pl-2">
          <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
          <span>{todayFormatted}</span>
        </div>
      </div>

      {/* Right: Actions, Notifications, Profile */}
      <div className="flex items-center gap-2.5">
        {/* Quick Search placeholder (Tablet/Desktop) */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-400 w-48 focus-within:border-slate-400 transition-colors">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>Search student or invoice...</span>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors relative"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white border border-slate-200 shadow-xl p-3 z-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-900">Actionable Notifications</span>
                <Badge variant="danger" className="text-[10px]">
                  3 Pending
                </Badge>
              </div>
              <div className="space-y-2 text-xs">
                <div className="p-2 rounded-lg bg-rose-50/70 border border-rose-100 text-rose-900">
                  <span className="font-semibold block">Overdue Warning</span>
                  Arjun Verma&apos;s Class 10 fee (₹8,500) is 14 days overdue.
                </div>
                <div className="p-2 rounded-lg bg-amber-50/70 border border-amber-100 text-amber-900">
                  <span className="font-semibold block">Payment Promise Due Today</span>
                  Priya Nair promised ₹6,000 payment by today evening.
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-800">
                  <span className="font-semibold block">Coaching Rent Upcoming</span>
                  ₹35,000 due in 4 days (25 Nov). Projected balance is safe.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button: Create Invoice */}
        <Button
          onClick={onCreateInvoiceClick}
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">Create Invoice</span>
          <span className="sm:hidden">Invoice</span>
        </Button>

        {/* User Profile & Logout Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-8 h-8 rounded-lg bg-slate-900 text-white font-semibold text-xs flex items-center justify-center shrink-0 shadow-xs border border-slate-700 hover:ring-2 hover:ring-emerald-500/50 transition-all cursor-pointer"
            aria-label="User account menu"
          >
            {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : sampleBusiness.ownerAvatar}
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user?.full_name || sampleBusiness.ownerName}
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {user?.email || "tutor@feepulse.com"}
                </p>
              </div>

              <div className="p-1">
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out of FeePulse
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
