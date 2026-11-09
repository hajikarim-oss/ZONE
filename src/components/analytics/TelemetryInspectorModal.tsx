"use client";

import React, { useEffect, useState } from "react";
import {
  Zap,
  X,
  Check,
  Copy,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Users,
  Film,
  Sparkles,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import { cn } from "@/lib/utils";

export type InspectorType = "editor" | "stage" | "brand" | "quality" | "metric";

export interface InspectorPayload {
  type: InspectorType;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: "blue" | "emerald" | "amber" | "rose" | "purple" | "slate";
  primaryMetric: {
    label: string;
    value: string | number;
    sub?: string;
    trend?: { delta: string; isPositive: boolean };
  };
  breakdown: Array<{
    label: string;
    value: string | number;
    pct?: number;
    color?: string;
    detail?: string;
  }>;
  insights?: string[];
  actionLabel?: string;
  onAction?: () => void;
}

type Props = {
  payload: InspectorPayload | null;
  onClose: () => void;
};

export default function TelemetryInspectorModal({ payload, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, onClose]);

  if (!payload) return null;

  const copySnapshot = () => {
    const text = `[TBM Telemetry Inspector]
${payload.title}
${payload.primaryMetric.label}: ${payload.primaryMetric.value} (${payload.primaryMetric.sub || ""})
Breakdown:
${payload.breakdown.map((b) => `• ${b.label}: ${b.value}`).join("\n")}
Insights:
${(payload.insights || []).map((ins) => `• ${ins}`).join("\n")}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getBadgeClass = (color?: string) => {
    switch (color) {
      case "emerald":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "amber":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "rose":
        return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30";
      case "purple":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30";
      default:
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-[#2C3B53] dark:bg-[#161B22] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ribbon Header */}
        <div className="flex items-center justify-between border-b border-stone-200/80 px-5 py-3 bg-[#FAF9F5]/70 dark:border-[#2C3B53] dark:bg-[#0F141C]">
          <div className="flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded-md bg-blue-600 text-white shadow-xs">
              <Zap className="size-3 fill-current" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Operations Telemetry Inspector
            </span>
            {payload.badge && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold border",
                  getBadgeClass(payload.badgeColor)
                )}
              >
                {payload.badge}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={copySnapshot}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-stone-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition cursor-pointer"
              title="Copy telemetry snapshot to clipboard"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-600" />
                  <span className="text-emerald-600 font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Hero Title & Primary Metric */}
        <div className="p-5 sm:p-6 border-b border-stone-100 bg-white dark:border-[#2C3B53] dark:bg-[#161B22]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                {payload.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {payload.subtitle}
              </p>
            </div>

            {/* Primary Metric Tile */}
            <div className="rounded-xl border border-stone-200/80 bg-[#FAF9F5]/70 p-3.5 shrink-0 min-w-[150px] text-right dark:border-[#2C3B53] dark:bg-[#0F141C]">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 block">
                {payload.primaryMetric.label}
              </span>
              <div className="text-2xl font-mono font-extrabold text-slate-950 dark:text-white mt-0.5 flex items-baseline justify-end gap-1.5">
                <span>{payload.primaryMetric.value}</span>
                {payload.primaryMetric.trend && (
                  <span
                    className={cn(
                      "text-xs font-semibold inline-flex items-center gap-0.5",
                      payload.primaryMetric.trend.isPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    )}
                  >
                    {payload.primaryMetric.trend.isPositive ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {payload.primaryMetric.trend.delta}
                  </span>
                )}
              </div>
              {payload.primaryMetric.sub && (
                <span className="text-[10px] text-slate-400 block mt-0.5 font-mono truncate">
                  {payload.primaryMetric.sub}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Breakdown & Telemetry Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 max-h-[50vh] scroll-thin">
          {/* Detailed Breakdown */}
          <div className="space-y-2.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block">
              Operational Signal Distribution
            </span>
            <div className="space-y-2">
              {payload.breakdown.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-stone-100 bg-[#FAF9F5]/40 p-2.5 text-[12px] dark:border-white/5 dark:bg-[#0F141C] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {row.label}
                    </span>
                    <div className="font-mono text-right">
                      <span className="font-bold text-slate-950 dark:text-white">{row.value}</span>
                      {row.detail && (
                        <span className="text-slate-400 text-[10.5px] ml-1.5">({row.detail})</span>
                      )}
                    </div>
                  </div>
                  {row.pct !== undefined && (
                    <div className="h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(3, row.pct))}%`,
                          backgroundColor: row.color || "#3b82f6",
                        }}
                        className="h-full rounded-full transition-all duration-500"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Operational Insights */}
          {payload.insights && payload.insights.length > 0 && (
            <div className="rounded-xl border border-blue-200/70 bg-blue-50/40 p-3.5 text-[11.5px] dark:border-blue-900/40 dark:bg-blue-950/20 space-y-2">
              <span className="font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-blue-600 dark:text-blue-400" />
                <span>Production Intelligence Insights</span>
              </span>
              <ul className="space-y-1 text-slate-700 dark:text-slate-300 pl-4 list-disc">
                {payload.insights.map((ins, i) => (
                  <li key={i}>{ins}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="flex items-center justify-between border-t border-stone-200/80 px-5 py-3 bg-[#FAF9F5]/70 dark:border-[#2C3B53] dark:bg-[#0F141C]">
          <span className="text-[11px] text-slate-400">
            Real-time telemetry updated live
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#2C3B53] dark:bg-[#161B22] dark:text-slate-300 transition"
            >
              Close
            </button>
            {payload.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  payload.onAction?.();
                  onClose();
                }}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-[11.5px] font-bold text-white shadow-xs hover:bg-blue-700 transition inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{payload.actionLabel}</span>
                <ArrowRight className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

