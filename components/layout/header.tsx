"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
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
  X,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sampleBusiness, sampleBranches } from "@/lib/sample-data";
import { createClient } from "@/lib/supabase/client";
import { CommandPalette } from "./command-palette";

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
  return "";
}

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onCreateInvoiceClick?: () => void;
}

interface NotificationItem {
  id: string;
  type: "danger" | "warning" | "info";
  title: string;
  desc: string;
  time: string;
}

export function Header({ onOpenMobileMenu, onCreateInvoiceClick }: HeaderProps) {
  const router = useRouter();

  // Tuition Branches State & Storage
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>(sampleBranches);
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("feepulse_selected_branch") || sampleBranches[0].name;
    }
    return sampleBranches[0].name;
  });

  // Dropdown & Modal Visibility States
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // User & Date State
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
  const todayFormatted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Dropdown Refs for Click-Outside Detection
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "notif-1",
      type: "danger",
      title: "Overdue Fee Warning",
      desc: "Arjun Verma's Class 10 fee (₹8,500) is 14 days overdue.",
      time: "14d overdue",
    },
    {
      id: "notif-2",
      type: "warning",
      title: "Payment Promise Due Today",
      desc: "Priya Nair promised ₹6,000 payment by today evening.",
      time: "Due today",
    },
    {
      id: "notif-3",
      type: "info",
      title: "Coaching Rent Upcoming",
      desc: "₹35,000 coaching rent due in 4 days (25 Nov). Projected balance is safe.",
      time: "In 4 days",
    },
  ]);
  const [hasUnread, setHasUnread] = useState(true);

  // 1. Fetch authenticated user and dynamic business branches
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser({
          email: data.user.email,
          full_name: (data.user.user_metadata?.full_name as string) || data.user.email?.split("@")[0],
        });

        // Load actual business profile for accurate tuition center name
        const { data: bizList } = await supabase
          .from("businesses")
          .select("id, name")
          .eq("owner_id", data.user.id)
          .order("created_at", { ascending: false });

        if (bizList && bizList.length > 0) {
          const primaryName = bizList[0].name;
          const dynamicBranches = [
            { id: `${bizList[0].id}-main`, name: `${primaryName} (Main Centre)` },
            { id: `${bizList[0].id}-senior`, name: `${primaryName} (Class 10-12 Batches)` },
            { id: `${bizList[0].id}-foundation`, name: `${primaryName} (Foundation Science & Maths)` },
          ];
          setBranches(dynamicBranches);

          const saved = typeof window !== "undefined" ? localStorage.getItem("feepulse_selected_branch") : null;
          if (!saved || saved.includes("Sharma Maths Academy")) {
            setSelectedBranch(dynamicBranches[0].name);
            localStorage.setItem("feepulse_selected_branch", dynamicBranches[0].name);
          }
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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

  // 2. Global Hotkey: ⌘K or Ctrl+K opens Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 3. Click-Outside & Escape Dismissal for Dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (branchMenuRef.current && !branchMenuRef.current.contains(target)) {
        setShowBranchMenu(false);
      }
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(target)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowBranchMenu(false);
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscKey);
    };
  }, []);

  const handleSelectBranch = (branchName: string) => {
    setSelectedBranch(branchName);
    if (typeof window !== "undefined") {
      localStorage.setItem("feepulse_selected_branch", branchName);
    }
    setShowBranchMenu(false);
  };

  const handleClearAllNotifications = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications([]);
    setHasUnread(false);
  };

  const handleDismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      if (updated.length === 0) setHasUnread(false);
      return updated;
    });
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        {/* Left: Mobile Trigger & Business Switcher */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Business Branch Selector */}
          <div ref={branchMenuRef} className="relative">
            <button
              onClick={() => setShowBranchMenu(!showBranchMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/90 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="max-w-[110px] sm:max-w-[220px] md:max-w-[280px] truncate">
                {selectedBranch}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {showBranchMenu && (
              <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Select Tuition Centre / Batch
                </div>
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    onClick={() => handleSelectBranch(branch.name)}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between transition-colors cursor-pointer"
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
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 pl-2 font-medium">
            <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
            <span>{todayFormatted || "Live Ledger"}</span>
          </div>
        </div>

        {/* Right: Actions, Search, Notifications, Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Quick Search trigger (Tablet/Desktop) */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="hidden sm:flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/90 text-xs text-slate-400 w-52 hover:border-slate-300 transition-colors cursor-pointer text-left"
            title="Press ⌘K or Ctrl+K to search"
            aria-label="Search students, invoices, and expenses"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate">Search students, bills...</span>
            </div>
            <span className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 font-mono">
              ⌘K
            </span>
          </button>

          {/* Quick Search Icon Button (Mobile) */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="sm:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Open global search"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Interactive Feature Guide Tour Trigger */}
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("feepulse:open_tour"));
              }
            }}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200/90 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            title="Open Interactive Feature Walkthrough"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tour Guide</span>
          </button>

          {/* Notification Bell */}
          <div ref={notificationMenuRef} className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors relative cursor-pointer"
              aria-label="View notifications"
            >
              <Bell className="w-4 h-4" />
              {hasUnread && notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-slate-200 shadow-xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Priority Notifications</span>
                    <Badge variant={notifications.length > 0 ? "danger" : "secondary"} className="text-[10px]">
                      {notifications.length} Pending
                    </Badge>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={handleClearAllNotifications}
                      className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="space-y-2 text-xs max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-6 px-3 text-center">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-1.5 opacity-90" />
                      <p className="font-bold text-xs text-slate-800">All caught up!</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">No unread notifications at this time.</p>
                    </div>
                  ) : (
                    notifications.map((item) => (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border relative group transition-all ${
                          item.type === "danger"
                            ? "bg-rose-50/70 border-rose-100 text-rose-900"
                            : item.type === "warning"
                            ? "bg-amber-50/70 border-amber-100 text-amber-900"
                            : "bg-slate-50 border-slate-100 text-slate-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold block text-[11px]">{item.title}</span>
                          <button
                            onClick={(e) => handleDismissNotification(item.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700 p-0.5 rounded transition-opacity cursor-pointer"
                            title="Dismiss notification"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed">{item.desc}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Button: Create Invoice */}
          <Button
            onClick={onCreateInvoiceClick}
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs shrink-0 px-2.5 sm:px-3"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Create Invoice</span>
            <span className="sm:hidden text-xs">Invoice</span>
          </Button>

          {/* User Profile & Logout Dropdown */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs border border-slate-700 hover:ring-2 hover:ring-emerald-500/50 transition-all cursor-pointer"
              aria-label="User account menu"
            >
              {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : sampleBusiness.ownerAvatar}
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
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
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
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

      {/* Global Multi-Search Command Palette */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
