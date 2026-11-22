import React from "react";
import Link from "next/link";
import { ArrowLeft, Clock, ShieldCheck, LucideIcon } from "lucide-react";
import { Button } from "./button";
import { Badge } from "./badge";
import { Card, CardContent } from "./card";

interface PlaceholderPageProps {
  title: string;
  badge: string;
  description: string;
  icon: LucideIcon;
  roadmapItems: string[];
}

export function PlaceholderPage({
  title,
  badge,
  description,
  icon: Icon,
  roadmapItems,
}: PlaceholderPageProps) {
  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-8 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-white/10 backdrop-blur rounded-xl">
              <Icon className="w-7 h-7 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
                <Badge variant="secondary" className="bg-indigo-400/20 text-indigo-200 border-indigo-400/30">
                  {badge}
                </Badge>
              </div>
              <p className="text-sm text-slate-300 mt-1">{description}</p>
            </div>
          </div>
        </div>

        <CardContent className="p-8">
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" /> Planned Architecture & Features
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {roadmapItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100 bg-slate-50/70"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-sm text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-4 mb-6">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Phase Alignment:</strong> This module is scheduled for implementation in Phase 2/3 following the foundational dashboard. All database schemas and RLS policies for this module are already compiled in Supabase migrations.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-400">FeePulse • AI Cashflow Copilot</span>
            <Link href="/">
              <Button variant="default" size="sm">
                Return to Overview
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
