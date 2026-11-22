"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next") || "/";
  // Safe redirect destination: strictly ensure relative internal path
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("\\")
      ? rawNext
      : "/";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError);

  const handleDemoLogin = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to start demo session.");
      }
      // Full page redirect to load server session cleanly
      window.location.href = data.redirect || "/";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to launch live demo.";
      setError(msg);
      setDemoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        let errorMsg = signInError.message || "Invalid email or password.";
        if (signInError.message.includes("Email not confirmed")) {
          errorMsg =
            "Email confirmation required. Please check your inbox and verify your email address before signing in.";
        } else if (
          signInError.message.includes("Invalid login credentials") ||
          signInError.status === 400
        ) {
          errorMsg = "Invalid email or password. Please verify your credentials and try again.";
        }
        setError(errorMsg);
        setLoading(false);
        return;
      }

      if (data.user) {
        // Full browser navigation ensures fresh session cookies are sent in HTTP headers to server & proxy
        window.location.href = next;
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred during sign in.";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError(
          "Unable to reach authentication service. Please check your internet connection and try again."
        );
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-white border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-200/50">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-md shadow-emerald-500/20 mb-4">
          <Activity className="w-6 h-6 text-white stroke-[2.5]" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome to FeePulse</h1>
        <p className="text-sm text-slate-500 mt-1">
          AI Cashflow Copilot for independent educators & tutors
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">{error}</div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tutor@academy.com"
              className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading || demoLoading}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md shadow-emerald-600/20 gap-2 transition-all cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign In to FeePulse
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>

      {/* One-Click Judge & Public Demo Access */}
      <div className="mt-6 pt-5 border-t border-slate-100">
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-slate-50 border border-emerald-200/80 text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-950 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            Hackathon Judge & Public Demo
          </div>
          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            Explore FeePulse with a preloaded demo academy and sample financial records. No registration required.
          </p>
          <Button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading || demoLoading}
            variant="outline"
            className="w-full py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border-emerald-300 font-bold rounded-xl shadow-xs gap-2 transition-all cursor-pointer"
          >
            {demoLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                Setting up Demo Workspace...
              </>
            ) : (
              <>
                Explore Live Demo
                <ArrowRight className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Switch to Signup */}
      <div className="mt-8 pt-6 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          New to FeePulse?{" "}
          <Link
            href="/signup"
            className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-50 to-slate-100/60">
      <Suspense fallback={<div className="text-slate-400 text-sm">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
