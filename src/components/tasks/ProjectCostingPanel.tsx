"use client";

import {
  AlertTriangle,
  Calculator,
  Check,
  DollarSign,
  ExternalLink,
  Plus,
  Receipt,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TimeEntryDTO } from "@/lib/actions";
import type { PersonDTO, TaskDTO } from "@/lib/dto";
import { cn } from "@/lib/utils";

type DirectCostItem = {
  id: string;
  category: "AI Credits" | "Stock Music / Footage" | "Freelancers" | "Rentals" | "Travel" | "Hard Drive / Media" | "Other";
  description: string;
  amountInr: number;
  receiptUrl?: string | null;
  addedByName: string;
  createdAt: string;
};

type CostConfig = {
  budgetInr: number;
  plannedHours: number;
  plannedDirectCostInr: number;
  overheadRatePerHour: number;
  productiveHoursPerMonth: number;
  monthlySharedOverheadInr: number;
  totalTeamMonthlyHours: number;
  targetMarginPct: number;
  directCosts: DirectCostItem[];
};

const DIRECT_COST_CATEGORIES: DirectCostItem["category"][] = [
  "AI Credits",
  "Stock Music / Footage",
  "Freelancers",
  "Rentals",
  "Travel",
  "Hard Drive / Media",
  "Other",
];

function fmtInr(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export default function ProjectCostingPanel({
  task: t,
  people,
  timeEntries,
  viewer,
}: {
  task: TaskDTO;
  people: PersonDTO[];
  timeEntries: TimeEntryDTO[] | null;
  viewer: { id: string; role: string; seeAll: boolean; admin: boolean };
}) {
  const { admin, seeAll, id: viewerId } = viewer;
  const [config, setConfig] = useState<CostConfig>({
    budgetInr: 50000,
    plannedHours: 40,
    plannedDirectCostInr: 10000,
    overheadRatePerHour: 100,
    productiveHoursPerMonth: 160,
    monthlySharedOverheadInr: 200000,
    totalTeamMonthlyHours: 2000,
    targetMarginPct: 40,
    directCosts: [],
  });
  const [editConfigOpen, setEditConfigOpen] = useState(false);
  const [addCostOpen, setAddCostOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add Direct Cost Form State
  const [costCategory, setCostCategory] = useState<DirectCostItem["category"]>("AI Credits");
  const [costDesc, setCostDesc] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costReceipt, setCostReceipt] = useState("");

  // Edit Config Form State
  const [draftBudget, setDraftBudget] = useState("50000");
  const [draftPlannedHours, setDraftPlannedHours] = useState("40");
  const [draftPlannedDirect, setDraftPlannedDirect] = useState("10000");
  const [draftMonthlyShared, setDraftMonthlyShared] = useState("200000");
  const [draftTeamMonthlyHours, setDraftTeamMonthlyHours] = useState("2000");
  const [draftProductiveHrs, setDraftProductiveHrs] = useState("160");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/meta?projectId=${encodeURIComponent(t.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.costConfig) {
          const c = data.costConfig as CostConfig;
          setConfig(c);
          setDraftBudget(String(c.budgetInr || 50000));
          setDraftPlannedHours(String(c.plannedHours || 40));
          setDraftPlannedDirect(String(c.plannedDirectCostInr ?? 10000));
          setDraftMonthlyShared(String(c.monthlySharedOverheadInr || 200000));
          setDraftTeamMonthlyHours(String(c.totalTeamMonthlyHours || 2000));
          setDraftProductiveHrs(String(c.productiveHoursPerMonth || 160));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [t.id]);

  // Step 1, 2, 3 Calculation Engine
  const calc = useMemo(() => {
    const entries = timeEntries ?? [];
    const byUser = new Map<string, { userId: string; userName: string; minutes: number }>();

    if (entries.length > 0) {
      for (const e of entries) {
        const cur = byUser.get(e.userId) || { userId: e.userId, userName: e.userName, minutes: 0 };
        cur.minutes += e.durationMinutes;
        byUser.set(e.userId, cur);
      }
    } else if ((t.totalDurationMinutes || 0) > 0) {
      const uid = t.assigneeId || viewerId;
      const uname = t.assigneeName || "Assigned Editor";
      byUser.set(uid, { userId: uid, userName: uname, minutes: t.totalDurationMinutes });
    }

    const productiveHrs = Math.max(1, config.productiveHoursPerMonth || 160);
    const overheadRate =
      config.monthlySharedOverheadInr && config.totalTeamMonthlyHours
        ? Math.round(config.monthlySharedOverheadInr / Math.max(1, config.totalTeamMonthlyHours))
        : config.overheadRatePerHour || 100;

    let totalHours = 0;
    let totalLaborCostInr = 0;
    let viewerHours = 0;

    const memberLines: {
      userId: string;
      userName: string;
      hours: number;
      hourlyRate: number;
      monthlyEquivalent: number;
      costInr: number;
    }[] = [];

    for (const u of byUser.values()) {
      const hrs = Math.round((u.minutes / 60) * 100) / 100;
      totalHours += hrs;
      if (u.userId === viewerId) viewerHours += hrs;

      const person = people.find((p) => p.id === u.userId);
      // Hourly cost = Monthly cost / 160 productive hours (default ₹300/hr = ₹48,000 / 160h)
      const hourlyRate = person?.hourlyRate && person.hourlyRate > 0 ? person.hourlyRate : 300;
      const monthlyEquivalent = hourlyRate * productiveHrs;
      const costInr = Math.round(hrs * hourlyRate);
      totalLaborCostInr += costInr;

      memberLines.push({
        userId: u.userId,
        userName: u.userName,
        hours: hrs,
        hourlyRate,
        monthlyEquivalent,
        costInr,
      });
    }

    const directCostsTotalInr = (config.directCosts || []).reduce(
      (sum, d) => sum + (Number(d.amountInr) || 0),
      0
    );
    const overheadCostInr = Math.round(totalHours * overheadRate);
    const totalActualCostInr = totalLaborCostInr + directCostsTotalInr + overheadCostInr;

    const budgetInr = Math.max(1, config.budgetInr || 50000);
    const marginInr = budgetInr - totalActualCostInr;
    const marginPct = Math.round((marginInr / budgetInr) * 1000) / 10;
    const budgetUsedPct = Math.round((totalActualCostInr / budgetInr) * 1000) / 10;

    // Planned cost = (plannedHours * avgHourlyRate(300)) + plannedDirectCost + (plannedHours * overheadRate)
    const plannedLaborInr = Math.round((config.plannedHours || 40) * 300);
    const plannedOverheadInr = Math.round((config.plannedHours || 40) * overheadRate);
    const plannedTotalCostInr =
      plannedLaborInr + (config.plannedDirectCostInr || 0) + plannedOverheadInr;

    const alertTier =
      budgetUsedPct >= 90
        ? "critical_90"
        : budgetUsedPct >= 75
          ? "warning_75"
          : budgetUsedPct >= 50
            ? "notice_50"
            : "healthy";

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      viewerHours: Math.round(viewerHours * 10) / 10,
      productiveHrs,
      overheadRate,
      memberLines,
      totalLaborCostInr,
      directCostsTotalInr,
      overheadCostInr,
      totalActualCostInr,
      budgetInr,
      marginInr,
      marginPct,
      budgetUsedPct,
      plannedTotalCostInr,
      alertTier,
    };
  }, [timeEntries, t.totalDurationMinutes, t.assigneeId, t.assigneeName, viewerId, people, config]);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!admin && !seeAll) return;
    setSaving(true);
    try {
      const monthlyShared = Number(draftMonthlyShared) || 200000;
      const teamMonthlyHrs = Math.max(1, Number(draftTeamMonthlyHours) || 2000);
      const overheadRate = Math.round(monthlyShared / teamMonthlyHrs);
      const res = await fetch("/api/portal/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateProjectCostConfig",
          projectId: t.id,
          patch: {
            budgetInr: Number(draftBudget) || 50000,
            plannedHours: Number(draftPlannedHours) || 40,
            plannedDirectCostInr: Number(draftPlannedDirect) || 0,
            monthlySharedOverheadInr: monthlyShared,
            totalTeamMonthlyHours: teamMonthlyHrs,
            overheadRatePerHour: overheadRate,
            productiveHoursPerMonth: Number(draftProductiveHrs) || 160,
          },
        }),
      });
      const data = await res.json();
      if (data?.costConfig) {
        setConfig(data.costConfig);
      }
      setEditConfigOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDirectCost(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(costAmount);
    if (!costDesc.trim() || !amt || amt <= 0) return;
    setSaving(true);
    try {
      const me = people.find((p) => p.id === viewerId);
      const res = await fetch("/api/portal/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addDirectCost",
          projectId: t.id,
          item: {
            category: costCategory,
            description: costDesc.trim(),
            amountInr: amt,
            receiptUrl: costReceipt.trim() || null,
            addedByName: me?.name || "Team",
          },
        }),
      });
      const data = await res.json();
      if (data?.costConfig) {
        setConfig(data.costConfig);
      }
      setCostDesc("");
      setCostAmount("");
      setCostReceipt("");
      setAddCostOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDirectCost(costId: string) {
    const res = await fetch("/api/portal/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteDirectCost",
        projectId: t.id,
        costId,
      }),
    });
    const data = await res.json();
    if (data?.costConfig) {
      setConfig(data.costConfig);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3.5 space-y-3 shadow-xs transition",
        calc.alertTier === "critical_90"
          ? "border-rose-500/80 bg-rose-50/40 dark:bg-rose-950/20"
          : calc.alertTier === "warning_75"
            ? "border-amber-400/80 bg-amber-50/30 dark:bg-amber-950/15"
            : "border-line bg-surface"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
        <div className="flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-[#0052CC]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink">
            Project Costing · Budget vs Actual
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {calc.alertTier === "critical_90" && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse">
              🚨 ≥90% BUDGET · FLAGGED RED
            </span>
          )}
          {calc.alertTier === "warning_75" && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              ⚠️ ≥75% Used · Admin & Mgr Alerted
            </span>
          )}
          {calc.alertTier === "notice_50" && (
            <span className="inline-flex items-center gap-1 rounded bg-blue-600/15 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-bold">
              ℹ️ ≥50% Used · Mgr Informed
            </span>
          )}
          {(admin || seeAll) && (
            <button
              type="button"
              onClick={() => setEditConfigOpen((o) => !o)}
              className="p-1 rounded text-muted hover:text-ink hover:bg-canvas cursor-pointer"
              title="Configure Project Budget, Planned Hours & Overhead Rate"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Extra Revision Scope Overage Warning */}
      {(t.revisionRound || 0) >= 3 && (
        <div className="rounded-md border border-purple-300 dark:border-purple-800 bg-purple-50/70 dark:bg-purple-950/30 px-2.5 py-1.5 text-[11px] text-purple-900 dark:text-purple-200 flex items-center justify-between">
          <span>
            <strong>Scope Alert (R{t.revisionRound}):</strong> Extra client revisions (R3+) tracked as billable scope overage.
          </span>
          <span className="font-mono font-bold">R{t.revisionRound}</span>
        </div>
      )}

      {/* Budget Used % Progress Bar (Visible to EVERYONE per Point 10 "Who sees what") */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-muted">Budget Used</span>
          <span
            className={cn(
              "font-mono font-bold text-[13px]",
              calc.budgetUsedPct >= 90
                ? "text-rose-600"
                : calc.budgetUsedPct >= 75
                  ? "text-amber-600"
                  : "text-emerald-600"
            )}
          >
            {calc.budgetUsedPct}%
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden relative">
          <div
            className={cn(
              "h-full transition-all duration-300",
              calc.budgetUsedPct >= 90
                ? "bg-rose-600"
                : calc.budgetUsedPct >= 75
                  ? "bg-amber-500"
                  : calc.budgetUsedPct >= 50
                    ? "bg-blue-600"
                    : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(100, Math.max(4, calc.budgetUsedPct))}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>Your Logged Hours: <strong className="text-ink">{calc.viewerHours}h</strong></span>
          <span>Total Project Hours: <strong className="text-ink">{calc.totalHours}h</strong> / {config.plannedHours}h planned</span>
        </div>
      </div>

      {/* ADMIN-ONLY FINANCIAL BREAKDOWN (Point 10: "Hourly costs and salaries are visible to admin only. Team members see their own hours and the project's budget used %, not anyone's rupee rate.") */}
      {admin ? (
        <div className="space-y-3 pt-2 border-t border-line">
          {/* Planned vs Actual Side-by-Side Cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-line bg-canvas/50 p-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Project Budget
              </div>
              <div className="font-mono text-[14px] font-bold text-ink mt-0.5">
                {fmtInr(calc.budgetInr)}
              </div>
              <div className="text-[10px] text-muted">
                Planned Cost: {fmtInr(calc.plannedTotalCostInr)}
              </div>
            </div>

            <div className="rounded-md border border-line bg-canvas/50 p-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Actual Total Cost
              </div>
              <div className="font-mono text-[14px] font-bold text-[#0052CC] mt-0.5">
                {fmtInr(calc.totalActualCostInr)}
              </div>
              <div className="text-[10px] text-muted">
                Live from tracker + assets
              </div>
            </div>

            <div
              className={cn(
                "rounded-md border p-2",
                calc.marginPct < (config.targetMarginPct || 40)
                  ? "border-rose-300 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-950/30"
                  : "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
              )}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Live Margin
              </div>
              <div
                className={cn(
                  "font-mono text-[14px] font-bold mt-0.5",
                  calc.marginInr < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-300"
                )}
              >
                {fmtInr(calc.marginInr)} ({calc.marginPct}%)
              </div>
              <div className="text-[10px] text-muted">
                Target ≥{config.targetMarginPct || 40}%
              </div>
            </div>
          </div>

          {/* Worked Formula Table (People's Time + Direct Costs + Shared Overhead) */}
          <div className="rounded-md border border-line overflow-hidden text-[11.5px]">
            <div className="bg-canvas px-2.5 py-1.5 font-bold text-[10.5px] uppercase tracking-wider text-muted flex items-center justify-between">
              <span>Live Cost Breakdown (Admin Only)</span>
              <span className="font-mono">Base: {calc.productiveHrs} prod hrs/mo</span>
            </div>
            <div className="divide-y divide-line/60">
              {calc.memberLines.map((m) => (
                <div key={m.userId} className="px-2.5 py-1.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-ink">{m.userName}</span>
                    <span className="text-muted ml-1.5 text-[11px]">
                      ({m.hours} hrs × {fmtInr(m.hourlyRate)}/hr)
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-ink">{fmtInr(m.costInr)}</span>
                </div>
              ))}

              {(config.directCosts || []).map((dc) => (
                <div key={dc.id} className="px-2.5 py-1.5 flex items-center justify-between bg-blue-50/20 dark:bg-blue-950/10">
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-semibold text-ink">{dc.category}:</span>{" "}
                    <span className="text-muted">{dc.description}</span>
                    {dc.receiptUrl && (
                      <a
                        href={dc.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10.5px] text-[#0052CC] hover:underline ml-1.5"
                      >
                        <Receipt className="h-2.5 w-2.5" /> Receipt
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono font-semibold text-ink">{fmtInr(dc.amountInr)}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteDirectCost(dc.id)}
                      className="text-muted hover:text-rose-600 cursor-pointer"
                      title="Remove direct cost"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="px-2.5 py-1.5 flex items-center justify-between bg-canvas/30">
                <div>
                  <span className="font-semibold text-ink">Shared Overhead</span>
                  <span className="text-muted ml-1.5 text-[11px]">
                    ({calc.totalHours} hrs × {fmtInr(calc.overheadRate)}/hr)
                  </span>
                </div>
                <span className="font-mono font-semibold text-ink">{fmtInr(calc.overheadCostInr)}</span>
              </div>

              <div className="px-2.5 py-1.5 flex items-center justify-between bg-canvas font-bold text-ink">
                <span>Total Cost (Labor + Direct + Overhead)</span>
                <span className="font-mono text-[#0052CC]">{fmtInr(calc.totalActualCostInr)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-line/70 bg-canvas/40 px-2.5 py-2 text-[11px] text-muted flex items-center justify-between">
          <span>
            Hourly rupee rates & salary breakdowns are restricted to <strong>Admin only</strong>.
          </span>
          <span className="font-mono font-semibold text-ink">
            {(config.directCosts || []).length} direct asset logs
          </span>
        </div>
      )}

      {/* Log Direct Cost Button (Manager or Team can log AI credits, stock footage, freelancers, rentals, travel) */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setAddCostOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#0052CC] hover:underline cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Log Direct Cost (AI Credits, Stock Music, Freelancer, Drive)</span>
        </button>
      </div>

      {/* Add Direct Cost Form */}
      {addCostOpen && (
        <form onSubmit={handleAddDirectCost} className="rounded-md border border-line bg-canvas/60 p-3 space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink">
            Log Project Direct Cost & Receipt
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={costCategory}
              onChange={(e) => setCostCategory(e.target.value as DirectCostItem["category"])}
              className="field-input text-[12px] py-1"
            >
              {DIRECT_COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              required
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value)}
              placeholder="Amount in ₹ (e.g. 8000)"
              className="field-input text-[12px] py-1"
            />
          </div>
          <input
            required
            value={costDesc}
            onChange={(e) => setCostDesc(e.target.value)}
            placeholder="Description (e.g. Higgsfield AI credits / Epidemic Sound license)"
            className="field-input w-full text-[12px] py-1"
          />
          <input
            value={costReceipt}
            onChange={(e) => setCostReceipt(e.target.value)}
            placeholder="Receipt link (Google Drive / Invoice URL — optional)"
            className="field-input w-full text-[12px] py-1"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setAddCostOpen(false)}
              className="btn-ghost text-[11.5px] py-1 px-2.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !costDesc.trim() || !costAmount}
              className="btn-primary text-[11.5px] py-1 px-3"
            >
              {saving ? "Saving..." : "Add Direct Cost"}
            </button>
          </div>
        </form>
      )}

      {/* Admin Config Form (Budget, Planned Hours, Planned Direct Cost, Shared Overhead) */}
      {editConfigOpen && (admin || seeAll) && (
        <form onSubmit={handleSaveConfig} className="rounded-md border border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink">
            Configure Project Budget & Overhead Formula
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10.5px] font-semibold text-muted block">Project Budget (₹)</label>
              <input
                type="number"
                value={draftBudget}
                onChange={(e) => setDraftBudget(e.target.value)}
                className="field-input w-full text-[12px] py-1"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-muted block">Planned Hours</label>
              <input
                type="number"
                value={draftPlannedHours}
                onChange={(e) => setDraftPlannedHours(e.target.value)}
                className="field-input w-full text-[12px] py-1"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-muted block">Expected Direct Costs (₹)</label>
              <input
                type="number"
                value={draftPlannedDirect}
                onChange={(e) => setDraftPlannedDirect(e.target.value)}
                className="field-input w-full text-[12px] py-1"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-muted block">Productive Hrs / Month</label>
              <input
                type="number"
                value={draftProductiveHrs}
                onChange={(e) => setDraftProductiveHrs(e.target.value)}
                className="field-input w-full text-[12px] py-1"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-muted block">Monthly Shared Overhead (₹)</label>
              <input
                type="number"
                value={draftMonthlyShared}
                onChange={(e) => setDraftMonthlyShared(e.target.value)}
                className="field-input w-full text-[12px] py-1"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-semibold text-muted block">Total Team Monthly Hours</label>
              <input
                type="number"
                value={draftTeamMonthlyHours}
                onChange={(e) => setDraftTeamMonthlyHours(e.target.value)}
                className="field-input w-full text-[12px] py-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setEditConfigOpen(false)}
              className="btn-ghost text-[11.5px] py-1 px-2.5"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-[11.5px] py-1 px-3">
              {saving ? "Saving..." : "Save Budget Config"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
