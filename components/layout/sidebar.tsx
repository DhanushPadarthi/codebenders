"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Activity,
  ShieldCheck,
  X,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sampleBusiness } from "@/lib/sample-data";
import { createClient } from "@/lib/supabase/client";

interface SidebarProps {
  onCloseMobile?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: "danger";
  isNew?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/cashflow", label: "Cashflow", icon: LineChart },
  { href: "/expenses", label: "Bills & Expenses", icon: Receipt },
  { href: "/recovery-queue", label: "Recovery Queue", icon: ListTodo },
  { href: "/ai-assistant", label: "AI Assistant", icon: Sparkles, isNew: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);

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
    <aside className="flex flex-col h-full w-64 bg-slate-900 text-slate-200 border-r border-slate-800/90 shrink-0 select-none">
      {/* Brand & Wordmark */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-800/80">
        <Link href="/" className="flex items-center gap-3 group" onClick={onCloseMobile}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-500/15 group-hover:scale-105 transition-transform">
            <Activity className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base text-white tracking-tight flex items-center gap-1.5 leading-none">
              FeePulse
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Copilot
              </span>
            </span>
            <span className="text-[11px] text-slate-400 font-medium tracking-tight mt-1 truncate max-w-[145px]">
              AI Cashflow for Tutors
            </span>
          </div>
        </Link>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Management
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={onCloseMobile}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group relative",
                isActive
                  ? "bg-slate-800/95 text-white shadow-xs border border-slate-700/80"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    "w-4 h-4 transition-colors",
                    isActive
                      ? "text-emerald-400 stroke-[2.3]"
                      : "text-slate-400 group-hover:text-slate-200"
                  )}
                />
                <span>{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {item.badge && (
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                      item.badgeVariant === "danger"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        : "bg-slate-800 text-slate-300 border-slate-700"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
                {item.isNew && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    AI Copilot
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Feature Guide & Tour Trigger */}
      <div className="px-3 py-1">
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("feepulse:open_tour"));
            }
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/70 transition-all cursor-pointer group"
          title="Open interactive walkthrough & feature guide"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>Interactive Tour Guide</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-emerald-400/90 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            Guide
          </span>
        </button>
      </div>

      {/* Micro-business Tagline Card */}
      <div className="mx-3 my-2 p-3 rounded-xl bg-slate-800/50 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
        <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Back Office Promise
        </p>
        &ldquo;Know who owes you. Predict what comes next. Act before cash runs out.&rdquo;
      </div>

      {/* Business & User Profile */}
      <div className="p-3 border-t border-slate-800/90 bg-slate-950/40">
        <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/60 transition-colors group">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-center shrink-0">
              {user?.full_name ? user.full_name.slice(0, 2).toUpperCase() : sampleBusiness.ownerAvatar}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-white">
                {user?.full_name || sampleBusiness.ownerName}
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                {user?.email || sampleBusiness.name}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign Out of FeePulse"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
