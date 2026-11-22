"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/formatters";
import { SmartCashflowAlert } from "@/lib/finance/cashflow-engine";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

interface SmartAlertsCardProps {
  alerts: SmartCashflowAlert[];
}

export function SmartAlertsCard({ alerts }: SmartAlertsCardProps) {
  const getSeverityStyle = (severity: SmartCashflowAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return {
          cardBg: "bg-rose-50/60 border-rose-200",
          iconBg: "bg-rose-100 text-rose-700",
          badge: "bg-rose-600 text-white",
          textColor: "text-rose-900",
        };
      case "warning":
        return {
          cardBg: "bg-amber-50/60 border-amber-200",
          iconBg: "bg-amber-100 text-amber-700",
          badge: "bg-amber-100 text-amber-800 border-amber-200",
          textColor: "text-amber-950",
        };
      case "info":
      default:
        return {
          cardBg: "bg-indigo-50/50 border-indigo-200",
          iconBg: "bg-indigo-100 text-indigo-700",
          badge: "bg-indigo-100 text-indigo-800 border-indigo-200",
          textColor: "text-indigo-950",
        };
    }
  };

  const getAlertIcon = (severity: SmartCashflowAlert["severity"]) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="w-4 h-4" />;
      case "warning":
        return <AlertCircle className="w-4 h-4" />;
      case "info":
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <CardTitle className="text-base font-bold text-slate-900">
              Smart Financial Guardrails &amp; Warnings
            </CardTitle>
          </div>
          <CardDescription>
            Proactive cash runway warnings derived deterministically from payment dates, promises, and fixed commitments.
          </CardDescription>
        </div>

        <Badge variant="outline" className="text-xs bg-slate-50 font-semibold text-slate-700">
          {alerts.length} Active {alerts.length === 1 ? "Notice" : "Notices"}
        </Badge>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        {alerts.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-emerald-50/50 border border-emerald-100">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <h4 className="text-xs font-bold text-emerald-900">All Financial Guardrails Clear</h4>
            <p className="text-xs text-emerald-700 mt-1">
              No projected deficits, safety buffer breaches, or overdue concentrations detected.
            </p>
          </div>
        ) : (
          alerts.map((alert) => {
            const styles = getSeverityStyle(alert.severity);

            return (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border transition-all ${styles.cardBg} space-y-2`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${styles.iconBg}`}>
                      {getAlertIcon(alert.severity)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${styles.textColor}`}>
                          {alert.title}
                        </span>
                        <Badge className={`text-[10px] font-semibold py-0 ${styles.badge}`}>
                          {alert.severity.toUpperCase()}
                        </Badge>
                        {alert.targetDate && (
                          <span className="text-[11px] text-slate-500 font-mono">
                            Target Date: {alert.targetDate}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {alert.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Financial Exposure
                    </span>
                    <span className="font-mono font-bold text-xs text-slate-900">
                      {formatINR(alert.impactAmount)}
                    </span>
                  </div>
                </div>

                {/* Recommendation & Actions */}
                <div className="pt-2 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="text-slate-700">
                    <strong className="text-slate-900">Recommended Action:</strong> {alert.recommendation}
                  </div>
                  {alert.type === "overdue_receivables" && (
                    <Link
                      href="/invoices?status=overdue"
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
                    >
                      View Overdue Invoices
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  {alert.type === "large_outflow" && (
                    <Link
                      href="/expenses"
                      className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:text-rose-800 shrink-0"
                    >
                      Manage Bills
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
