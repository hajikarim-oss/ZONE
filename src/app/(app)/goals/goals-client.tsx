"use client";

import { Plus, Target, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Avatar from "@/components/Avatar";
import { createGoal, deleteGoal, updateGoal } from "@/lib/actions";
import { cn, fmtDate, toInputDate } from "@/lib/utils";

type Goal = {
  id: string; title: string; ownerId: string | null; ownerName: string | null; brandName: string | null; brandColor: string | null;
  dueDate: string | null; progress: number; status: string; notes: string | null;
};
const STATUSES = ["On track", "At risk", "Off track", "Achieved"];
const TONE: Record<string, string> = {
  "On track": "bg-emerald-50 text-emerald-700",
  "At risk": "bg-amber-50 text-amber-700",
  "Off track": "bg-rose-50 text-rose-700",
  Achieved: "bg-sky-50 text-sky-700",
};

export default function GoalsClient({ goals, people, brands, meId, canManage }: { goals: Goal[]; people: { id: string; name: string }[]; brands: { id: string; name: string }[]; meId: string; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
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

  const achieved = goals.filter((g) => g.status === "Achieved").length;

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">Goals</h1>
            <p className="mt-1 text-[13px] text-muted">What the team is working towards. {goals.length ? `${achieved} of ${goals.length} achieved.` : ""}</p>
          </div>
          {canManage && (
            <button className="btn-primary" onClick={() => setAdding((a) => !a)}>
              <Plus className="h-4 w-4" /> Add goal
            </button>
          )}
        </div>

        {adding && (
          <form
            className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas p-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await createGoal({ title, ownerId: owner, brandId: brand || null, dueDate: due || null });
                setTitle("");
                setAdding(false);
              });
            }}
          >
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Deliver 40 reels for Unseen Man in Q4" className="field-input min-w-[240px] flex-1" />
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="field-input w-auto">
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="field-input w-auto">
              <option value="">Whole team</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input w-auto" />
            <button className="btn-primary" disabled={pending || !title.trim()}>Add</button>
          </form>
        )}
        {err && <p className="mt-3 text-[12px] text-rose-600">{err}</p>}

        <div className="mt-6 space-y-2">
          {goals.length === 0 && (
            <div className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-[13px] text-muted">
              <Target className="mx-auto mb-2 h-6 w-6" />
              No goals yet.{canManage ? " Add the first one to give the team something to aim for." : ""}
            </div>
          )}
          {goals.map((g) => {
            const editable = canManage || g.ownerId === meId;
            return (
              <div key={g.id} className="group rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Target className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 text-[14px] font-medium">{g.title}</span>
                  {g.brandName && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: g.brandColor ?? "#a2a0a2" }} />
                      {g.brandName}
                    </span>
                  )}
                  {editable ? (
                    <select
                      value={g.status}
                      onChange={(e) => run(() => updateGoal(g.id, { status: e.target.value }))}
                      className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium outline-none", TONE[g.status])}
                    >
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[g.status])}>{g.status}</span>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-4 pl-7 text-[12px] text-muted">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${g.progress}%` }} />
                    </div>
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={g.progress}
                        key={g.progress}
                        onBlur={(e) => Number(e.target.value) !== g.progress && run(() => updateGoal(g.id, { progress: Number(e.target.value) }))}
                        className="w-14 rounded border border-line bg-surface px-1 py-0.5 text-[12px]"
                      />
                    ) : (
                      <span>{g.progress}</span>
                    )}
                    %
                  </div>
                  <span className="inline-flex items-center gap-1">
                    {g.ownerName && <Avatar name={g.ownerName} size={18} />} {g.ownerName ?? "No owner"}
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
                      className="ml-auto opacity-0 hover:text-rose-600 group-hover:opacity-100"
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
