"use client";

import Avatar from "@/components/Avatar";
import type { TaskDTO } from "@/lib/dto";
import { computeStage, STAGE_GROUPS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { BrandChip, DelayBadge, DueText, PriorityPill } from "./bits";

// Board grouped by pipeline stage. Stage is derived from several fields, so
// cards aren't dragged between columns — open a card to change its status.
export default function TaskBoard({
  tasks,
  showDone,
  selectedId,
  onOpen,
}: {
  tasks: TaskDTO[];
  showDone: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  const columns = STAGE_GROUPS.filter((g) => showDone || (g.key !== "delivered" && g.key !== "closed"));
  return (
    <div className="flex h-full gap-3 pb-4">
      {columns.map((col) => {
        const items = tasks.filter((t) => computeStage(t).key === col.key);
        return (
          <div key={col.key} className="flex w-72 shrink-0 flex-col rounded-lg bg-canvas">
            <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold">
              <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
              {col.label}
              <span className="font-normal text-muted">{items.length}</span>
            </div>
            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  className={cn(
                    "block w-full rounded-lg border bg-surface p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-muted/40",
                    selectedId === t.id ? "border-accent" : "border-line",
                  )}
                >
                  <div className="text-[13px] leading-snug">{t.title}</div>
                  <div className="mt-1 text-[11px] text-muted">{t.code} · {computeStage(t).label}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <PriorityPill value={t.priority} />
                    <DelayBadge t={t} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <BrandChip name={t.brandName} color={t.brandColor} />
                    <div className="flex items-center gap-2">
                      <DueText date={t.internalDeadline} />
                      {t.assigneeName && <Avatar name={t.assigneeName} size={22} />}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
