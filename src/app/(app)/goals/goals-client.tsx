"use client";

import { CheckCircle2, FileBarChart, Lock, Plus, RefreshCw, ShieldCheck, Target, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { createGoal, deleteGoal, updateGoal } from "@/lib/actions";
import { cn, fmtDate, toInputDate } from "@/lib/utils";

type Goal = {
  id: string;
  title: string;
  ownerId: string | null;
  ownerName: string | null;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  dueDate: string | null;
  progress: number;
  autoProgress: number;
  linkedTotalTasks: number;
  linkedDoneTasks: number;
  status: string;
  notes: string | null;
};

const STATUSES = ["On track", "At risk", "Off track", "Achieved"];
const TONE: Record<string, string> = {
  "On track": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "At risk": "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "Off track": "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  Achieved: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
};

const GOAL_TYPES = [
  "Deliverables Target (Auto-Tracked)",
  "On-Time Deadlines %",
  "Revision Quality (≤ R2)",
  "Hybrid Campaign + Individual Target",
];

export default function GoalsClient({
  goals,
  people,
  brands,
  meId,
  canManage,
}: {
  goals: Goal[];
  people: { id: string; name: string }[];
  brands: { id: string; name: string; campaigns?: { id: string; name: string }[] }[];
  meId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [goalType, setGoalType] = useState(GOAL_TYPES[0]);
  const [owner, setOwner] = useState(meId);
  const [brand, setBrand] = useState("");
  const [due, setDue] = useState("");

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setErr(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  const achievedGoals = goals.filter((g) => g.status === "Achieved" || g.autoProgress >= 100);
  const unachievedGoals = goals.filter((g) => g.status !== "Achieved" && g.autoProgress < 100);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-tight">Project, Campaign & Individual Goals</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Auto-Tracked & Audit-Protected
              </span>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              Set targets for projects/campaigns and individual team members. Progress is tracked automatically from project tasks, and goal-linked tasks are protected against unlogged deletion.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canManage && (
              <button
                type="button"
                onClick={() => setWeeklyReportOpen((o) => !o)}
                className="btn-ghost border border-line text-[12.5px] font-semibold"
              >
                <FileBarChart className="h-4 w-4 text-[#0052CC]" />
                Weekly Goal Report ({achievedGoals.length}/{goals.length})
              </button>
            )}
            {canManage && (
              <button className="btn-primary" onClick={() => setAdding((a) => !a)}>
                <Plus className="h-4 w-4" /> Set Project / Individual Goal
              </button>
            )}
          </div>
        </div>

        {/* Weekly Report Summary Card for Admin / Manager (Point 2: "A weekly report should go to the admin or manager showing which goals were achieved and which were not") */}
        {weeklyReportOpen && (
          <div className="mt-4 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div>
                <h3 className="text-[14px] font-bold text-ink">
                  Weekly Admin & Manager Goal Achievement Report
                </h3>
                <p className="text-[11.5px] text-muted">
                  Automatically dispatched every Monday in the weekly summary email + mid-week alert if any goal falls behind
                </p>
              </div>
              <span className="rounded-full bg-[#0052CC] px-2.5 py-0.5 text-[11px] font-bold text-white">
                {achievedGoals.length} Achieved · {unachievedGoals.length} In Progress / Behind
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-surface p-3 space-y-1.5">
                <div className="font-bold text-emerald-700 dark:text-emerald-400 text-[11.5px] uppercase tracking-wider">
                  ✓ Goals Achieved ({achievedGoals.length})
                </div>
                {achievedGoals.length === 0 ? (
                  <p className="text-muted text-[12px]">No goals have reached 100% yet this week.</p>
                ) : (
                  achievedGoals.map((g) => (
                    <div key={g.id} className="flex items-center justify-between py-1 border-b border-line/50 last:border-0">
                      <span className="font-medium text-ink truncate">{g.title}</span>
                      <span className="text-[11px] font-mono font-bold text-emerald-600 shrink-0 ml-2">
                        {g.ownerName || "Team"} · {Math.max(g.progress, g.autoProgress)}%
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-surface p-3 space-y-1.5">
                <div className="font-bold text-amber-700 dark:text-amber-400 text-[11.5px] uppercase tracking-wider">
                  ⏳ Goals Not Yet Achieved / At Risk ({unachievedGoals.length})
                </div>
                {unachievedGoals.length === 0 ? (
                  <p className="text-muted text-[12px]">All active goals have been achieved!</p>
                ) : (
                  unachievedGoals.map((g) => (
                    <div key={g.id} className="flex items-center justify-between py-1 border-b border-line/50 last:border-0">
                      <span className="font-medium text-ink truncate">{g.title}</span>
                      <span className="text-[11px] font-mono font-bold text-amber-600 shrink-0 ml-2">
                        {g.ownerName || "Team"} · Auto: {g.autoProgress}% ({g.linkedDoneTasks}/{g.linkedTotalTasks} tasks)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {adding && (
          <form
            className="mt-4 space-y-3 rounded-xl border border-line bg-canvas p-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await createGoal({
                  title: `[${goalType.split(" ")[0]}] ${title.trim()}`,
                  ownerId: owner || null,
                  brandId: brand || null,
                  dueDate: due || null,
                });
                setTitle("");
                setAdding(false);
              });
            }}
          >
            <div className="text-[12px] font-bold uppercase tracking-wider text-ink">
              Create Project / Campaign or Individual Member Goal
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Deliver 20 Reels for Ferrari Campaign with ≤2 Revisions"
                className="field-input w-full"
              />
              <select
                value={goalType}
                onChange={(e) => setGoalType(e.target.value)}
                className="field-input w-full"
              >
                {GOAL_TYPES.map((gt) => (
                  <option key={gt} value={gt}>
                    {gt}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="field-input w-auto"
                title="Individual Member or Whole Team"
              >
                <option value="">Whole Campaign / Team Goal</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    Individual: {p.name}
                  </option>
                ))}
              </select>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="field-input w-auto"
                title="Project / Brand"
              >
                <option value="">All Brands / Studio-wide</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    Project/Brand: {b.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="field-input w-auto"
              />
              <button className="btn-primary ml-auto" disabled={pending || !title.trim()}>
                Save Goal
              </button>
            </div>
          </form>
        )}

        {err && <p className="mt-3 text-[12px] text-rose-600">{err}</p>}

        <div className="mt-6 space-y-2.5">
          {goals.length === 0 && (
            <div className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-[13px] text-muted">
              <Target className="mx-auto mb-2 h-6 w-6" />
              No goals yet.{canManage ? " Add the first one to give the team something to aim for." : ""}
            </div>
          )}
          {goals.map((g) => {
            const editable = canManage || g.ownerId === meId;
            const effectiveProgress = g.linkedTotalTasks > 0 ? g.autoProgress : g.progress;
            return (
              <div key={g.id} className="group rounded-xl border border-line bg-surface p-3.5 shadow-2xs">
                <div className="flex flex-wrap items-center gap-3">
                  <Target className="h-4 w-4 shrink-0 text-[#0052CC]" />
                  <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{g.title}</span>

                  <span
                    className="inline-flex items-center gap-1 rounded bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-muted"
                    title="Tasks linked to this goal cannot be silently deleted to fake goal completion; deletions are soft-archived and logged for managers."
                  >
                    <Lock className="h-2.5 w-2.5" /> Audit-Locked Tasks ({g.linkedDoneTasks}/{g.linkedTotalTasks} done)
                  </span>

                  {g.brandName && (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ink">
                      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: g.brandColor ?? "#0052CC" }} />
                      {g.brandName}
                    </span>
                  )}

                  {editable ? (
                    <select
                      value={g.status}
                      onChange={(e) => run(() => updateGoal(g.id, { status: e.target.value }))}
                      className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold outline-none cursor-pointer", TONE[g.status])}
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", TONE[g.status])}>
                      {g.status}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 pl-7 text-[12px] text-muted">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-44 overflow-hidden rounded-full bg-canvas">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          effectiveProgress >= 100 ? "bg-emerald-500" : "bg-[#0052CC]"
                        )}
                        style={{ width: `${Math.min(100, effectiveProgress)}%` }}
                      />
                    </div>
                    <span className="font-mono font-bold text-ink">
                      {effectiveProgress}%
                    </span>
                    {g.linkedTotalTasks > 0 && g.progress !== g.autoProgress && editable && (
                      <button
                        type="button"
                        onClick={() =>
                          run(() =>
                            updateGoal(g.id, {
                              progress: g.autoProgress,
                              status: g.autoProgress >= 100 ? "Achieved" : "On track",
                            })
                          )
                        }
                        className="inline-flex items-center gap-1 rounded bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#0052CC] hover:underline cursor-pointer"
                        title="Sync stored progress with live completed tasks"
                      >
                        <RefreshCw className="h-2.5 w-2.5" /> Sync ({g.autoProgress}%)
                      </button>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    {g.ownerName ? (
                      <>
                        <Avatar name={g.ownerName} size={18} />
                        <span>{g.ownerName} (Individual Goal)</span>
                      </>
                    ) : (
                      <span>Campaign / Team Goal</span>
                    )}
                  </span>

                  {editable ? (
                    <input
                      type="date"
                      value={toInputDate(g.dueDate)}
                      onChange={(e) => run(() => updateGoal(g.id, { dueDate: e.target.value || null }))}
                      className="rounded border border-transparent bg-transparent px-1 text-[12px] hover:border-line"
                    />
                  ) : (
                    <span>{g.dueDate ? `Due ${fmtDate(g.dueDate, true)}` : "No due date"}</span>
                  )}

                  {canManage && (
                    <button
                      className="ml-auto opacity-0 hover:text-rose-600 group-hover:opacity-100 cursor-pointer"
                      onClick={() => confirm(`Delete goal "${g.title}"?`) && run(() => deleteGoal(g.id))}
                      title="Delete goal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
