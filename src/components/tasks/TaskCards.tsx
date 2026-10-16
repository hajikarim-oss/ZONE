"use client";

import { ChevronDown, ChevronRight, HardDrive, MessageSquare } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { EDIT_STATUSES, SCRIPT_STAGES } from "@/lib/constants";
import { BOARD_COLUMNS, boardColumn, boardStatusPatch, isDone, type BoardKey } from "@/lib/status";
import { cn } from "@/lib/utils";
import { canEditField } from "@/lib/rbac";
import { BrandChip, CellSelect, DelayBadge, DueText, OnHoldBadge, opts, PriorityPill, StagePill } from "./bits";
import type { Group } from "./TaskList";

const BOARD_STATUS_OPTS = BOARD_COLUMNS.map((c) => ({ value: c.key, label: c.label }));

// Phone version of the task list: one card per task, same groups, same
// inline status dropdown. Tapping a card opens the task panel full-screen.
export default function TaskCards({
  groups,
  viewer,
  statusField,
  showAssignee,
  showBrand,
  selectedId,
  onOpen,
  onUpdate,
}: {
  groups: Group[];
  viewer: { id: string; role: string; seeAll: boolean };
  statusField: "editStatus" | "scriptStage";
  showAssignee: boolean;
  showBrand: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const statusOptions = statusField === "scriptStage" ? SCRIPT_STAGES : EDIT_STATUSES;

  return (
    <div className="space-y-1 pb-6">
      {groups.map((g) => (
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
                const canStatus = canEditField(viewer, statusField, t);
                const currentBoardStatus = boardColumn(t);

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
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                          <span>{t.code}</span>
                          {t.subtaskCount > 0 && <span>· ↳ {t.subtaskCount} subtasks</span>}
                        </div>
                      </div>
                      {showAssignee && t.assigneeName && <Avatar name={t.assigneeName} size={24} />}
                      {t.assigneeId !== viewer.id && t.collaboratorIds.includes(viewer.id) && (
                        <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">Collaborator</span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <StagePill t={t} />
                      <DelayBadge t={t} />
                      <OnHoldBadge onHold={t.onHold} canEdit={canEditField(viewer, "onHold", t)} onClick={() => onUpdate(t.id, { onHold: false })} />
                      {showBrand && <BrandChip name={t.brandName} color={t.brandColor} />}
                      {t.storageDeviceName && (
                        <span className="inline-flex items-center gap-1 rounded bg-canvas px-1.5 py-0.5 text-[10px] text-muted">
                          <HardDrive className="h-2.5 w-2.5" />
                          {t.storageDeviceName}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted">
                      {t.startDate && (
                        <span>
                          Start: <DueText date={t.startDate} done={done} />
                        </span>
                      )}
                      <span>
                        End: <DueText date={t.internalDeadline} done={done} />
                      </span>
                      {viewer.seeAll && t.externalDeadline && (
                        <span>
                          Due: <DueText date={t.externalDeadline} done={done} />
                        </span>
                      )}
                      <PriorityPill value={t.priority} />
                      {t.revisionRound > 0 && <span>R{t.revisionRound}</span>}
                      {t.commentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />
                          {t.commentCount}
                        </span>
                      )}
                    </div>

                    {/* Direct Status dropdown on card */}
                    <div className="mt-2.5 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="rounded-md border border-line">
                        <CellSelect
                          value={currentBoardStatus}
                          options={BOARD_STATUS_OPTS}
                          onChange={(v) => onUpdate(t.id, boardStatusPatch(t, v as BoardKey))}
                          className="py-1 text-[12px]"
                        />
                      </div>
                      {canStatus && (
                        <div className="rounded-md border border-line">
                          <CellSelect
                            value={t[statusField]}
                            options={opts(statusOptions)}
                            onChange={(v) => onUpdate(t.id, { [statusField]: v })}
                            className="py-1 text-[12px]"
                          />
                        </div>
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
