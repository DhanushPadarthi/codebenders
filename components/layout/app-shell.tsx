"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CreateInvoiceModal } from "@/components/dashboard/create-invoice-modal";
import { InvoiceProvider } from "@/lib/invoice-context";
import { WelcomeWalkthrough } from "@/components/onboarding/welcome-walkthrough";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);

  const isAuthRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth");

  if (isAuthRoute) {
    return <main className="min-h-screen bg-slate-50">{children}</main>;
  }

  return (
    <InvoiceProvider>
      <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
        {/* Desktop Persistent Sidebar */}
        <div className="hidden md:flex md:shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Drawer Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Mobile Sidebar Slider */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out md:hidden ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
        </div>

        {/* Main Content Column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onCreateInvoiceClick={() => setCreateInvoiceOpen(true)}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
              {children}
            </div>
          </main>
        </div>

        {/* Global Create Invoice Modal */}
        <CreateInvoiceModal
          isOpen={createInvoiceOpen}
          onClose={() => setCreateInvoiceOpen(false)}
        />

        {/* Device-Responsive Onboarding & Feature Walkthrough */}
        <WelcomeWalkthrough />
      </div>
    </InvoiceProvider>
  );
}
