"use client";

import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { isDone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { canEditField } from "@/lib/rbac";
import { BrandChip, DelayBadge, DueText, PriorityPill, StatusSelect } from "./bits";
import type { Group } from "./TaskList";

// Phone version of the task list: one card per task, same groups, same
// inline status dropdown. Tapping a card opens the task panel full-screen.
export default function TaskCards({
  groups,
  viewer,
  showAssignee,
  showBrand,
  selectedId,
  onOpen,
  onUpdate,
}: {
  groups: Group[];
  viewer: { id: string; role: string; seeAll: boolean };
  showAssignee: boolean;
  showBrand: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const visibleGroups = groups.filter((g) => g.tasks.length > 0 || groups.length === 1);

  return (
    <div className="space-y-1 pb-6">
      {visibleGroups.map((g) => (
        <section key={g.key}>
          {(groups.length > 1 || g.label) && (
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
              className="flex w-full items-center gap-1.5 px-1 pb-2 pt-4 text-left text-[14px] font-semibold"
            >
              {collapsed[g.key] ? <ChevronRight className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
              {g.color && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: g.color }} />}
              {g.label}
              <span className="ml-1 text-[12px] font-normal text-muted">{g.tasks.length}</span>
            </button>
          )}
          {!collapsed[g.key] && (
            <div className="space-y-2">
              {g.tasks.map((t) => {
                const done = isDone(t);
                const canStatus = canEditField(viewer, "editStatus", t);
                return (
                  <div
                    key={t.id}
                    onClick={() => onOpen(t.id)}
                    className={cn(
                      "rounded-lg border bg-surface p-3 active:bg-canvas",
                      selectedId === t.id ? "border-accent" : "border-line",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full border", done ? "border-emerald-500 bg-emerald-500" : "border-muted/50")} />
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-[14px] leading-snug", done && "text-muted line-through decoration-muted/40")}>{t.title}</div>
                        <div className="mt-0.5 text-[11px] text-muted">{t.code}</div>
                      </div>
                      {showAssignee && t.assigneeName && <Avatar name={t.assigneeName} size={24} />}
                      {t.assigneeId !== viewer.id && t.collaboratorIds.includes(viewer.id) && (
                        <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">Collaborator</span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span onClick={(e) => e.stopPropagation()} className="w-32"><StatusSelect t={t} disabled={!canStatus} onUpdate={onUpdate} /></span>
                      <DelayBadge t={t} />
                      {showBrand && <BrandChip name={t.brandName} color={t.brandColor} />}
                    </div>

                    <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
                      <span>
                        Due <DueText date={t.internalDeadline} done={done} />
                      </span>
                      <PriorityPill value={t.priority} />
                      {t.revisionRound > 0 && <span>R{t.revisionRound}</span>}
                      {t.commentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {t.commentCount}
                        </span>
                      )}
                    </div>

                  </div>
                );
              })}
              {g.tasks.length === 0 && <div className="px-1 py-2 text-[12px] text-muted">No tasks</div>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
