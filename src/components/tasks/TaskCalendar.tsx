"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { TaskDTO } from "@/lib/dto";
import { computeStage, isDone, STAGE_GROUPS } from "@/lib/status";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function key(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function TaskCalendar({ tasks, onOpen, seeAll }: { tasks: TaskDTO[]; onOpen: (id: string) => void; seeAll: boolean }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [field, setField] = useState<"internalDeadline" | "externalDeadline">("internalDeadline");

  const byDay = useMemo(() => {
    const m = new Map<string, TaskDTO[]>();
    for (const t of tasks) {
      const v = t[field];
      if (!v) continue;
      const k = key(new Date(v));
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return m;
  }, [tasks, field]);

  const first = new Date(cursor);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const todayKey = key(new Date());

  // If this month has nothing, point to the nearest month that does.
  const monthIdx = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const dated = tasks.map((t) => t[field]).filter(Boolean).map((v) => new Date(v as string));
  const undated = tasks.length - dated.length;
  const cur = monthIdx(cursor);
  const inThisMonth = dated.filter((d) => monthIdx(d) === cur).length;
  let nearest: Date | null = null;
  for (const d of dated) {
    if (!nearest || Math.abs(monthIdx(d) - cur) < Math.abs(monthIdx(nearest) - cur)) nearest = d;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn-outline px-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="btn-outline px-2" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </button>
        <button className="btn-ghost" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>
          Today
        </button>
        <h2 className="ml-1 text-[15px] font-semibold">
          {cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </h2>
        {seeAll && (
          <select value={field} onChange={(e) => setField(e.target.value as any)} className="field-input ml-auto w-auto py-1">
            <option value="internalDeadline">Team deadlines</option>
            <option value="externalDeadline">Client deadlines</option>
          </select>
        )}
      </div>
      {(inThisMonth === 0 || undated > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-canvas px-3 py-2 text-[12px] text-muted">
          {inThisMonth === 0 && (
            nearest ? (
              <>
                <span>
                  No {field === "internalDeadline" ? "team" : "client"} deadlines in {cursor.toLocaleDateString("en-IN", { month: "long" })}. Nearest:{" "}
                  <span className="text-ink">{nearest.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
                </span>
                <button className="btn-outline py-0.5" onClick={() => setCursor(new Date(nearest!.getFullYear(), nearest!.getMonth(), 1))}>
                  Go there
                </button>
              </>
            ) : (
              <span>None of these tasks has a {field === "internalDeadline" ? "team" : "client"} deadline yet.</span>
            )
          )}
          {undated > 0 && <span className="ml-auto">{undated} task{undated > 1 ? "s" : ""} without a date (not shown)</span>}
        </div>
      )}
      <div className="scroll-thin overflow-x-auto">
      <div className="grid min-w-[700px] grid-cols-7 border-l border-t border-line text-[12px]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-b border-r border-line px-2 py-1.5 font-medium text-muted">{w}</div>
        ))}
        {days.map((d) => {
          const items = byDay.get(key(d)) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={key(d)} className={cn("min-h-[112px] border-b border-r border-line p-1.5", !inMonth && "bg-canvas/60")}>
              <div className={cn("mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px]", key(d) === todayKey ? "bg-accent text-white" : inMonth ? "text-ink" : "text-muted/60")}>
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {items.slice(0, 4).map((t) => {
                  const g = STAGE_GROUPS.find((x) => x.key === computeStage(t).key)!;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onOpen(t.id)}
                      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]", isDone(t) && "line-through opacity-60")}
                      style={{ background: g.dot + "26" }}
                      title={`${t.code} · ${t.title}`}
                    >
                      {t.title}
                    </button>
                  );
                })}
                {items.length > 4 && <div className="px-1.5 text-[11px] text-muted">+{items.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}
