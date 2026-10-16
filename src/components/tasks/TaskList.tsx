"use client";

import { ChevronDown, ChevronRight, HardDrive, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import type { BrandDTO, PersonDTO, TaskDTO } from "@/lib/dto";
import { BOARD_COLUMNS, boardColumn, boardStatusPatch, computeStage, type BoardKey } from "@/lib/status";
import { EDIT_STATUSES, PRIORITIES, REVISION_ROUNDS, SCRIPT_STAGES } from "@/lib/constants";
import { isDone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { canEditField } from "@/lib/rbac";
import { BrandChip, CellSelect, DelayBadge, DueText, OnHoldBadge, opts, PriorityPill, StagePill } from "./bits";

export type Group = { key: string; label: string; color?: string; tasks: TaskDTO[] };

type Props = {
  groups: Group[];
  allTasks?: TaskDTO[];
  people: PersonDTO[];
  brands: BrandDTO[];
  viewer: { id: string; role: string; seeAll: boolean };
  statusField: "editStatus" | "scriptStage";
  showAssignee: boolean;
  showBrand: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
};

const BOARD_STATUS_OPTS = BOARD_COLUMNS.map((c) => ({ value: c.key, label: c.label }));

// Asana-style list: one quiet row per task, inline dropdowns, collapsible
// sections, with expandable subtasks nested directly under parents.
export default function TaskList(p: Props) {
  const seeAll = p.viewer.seeAll;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

  const cols = [
    "minmax(280px,1fr)",
    p.showAssignee ? "150px" : null,
    p.showBrand ? "130px" : null,
    "110px",   // Start date
    "110px",   // End date
    seeAll ? "100px" : null, // Due date
    "90px",    // Priority
    "130px",   // Board Status (mirrors board 1:1)
    "160px",   // Edit status / Script status
    "60px",    // Revision round
  ].filter(Boolean).join(" ");

  const editable = (t: TaskDTO, field: string) => canEditField(p.viewer, field, t);
  const statusOptions = p.statusField === "scriptStage" ? SCRIPT_STAGES : EDIT_STATUSES;

  function toggleSubtasks(parentId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedSubtasks((prev) => ({ ...prev, [parentId]: !prev[parentId] }));
  }

  // Find subtasks in allTasks or within the group
  function getSubtasksFor(parentId: string) {
    const pool = p.allTasks || p.groups.flatMap((g) => g.tasks);
    return pool.filter((t) => t.parentId === parentId);
  }

  return (
    <div className="min-w-[1100px]">
      {/* header */}
      <div
        className="sticky top-0 z-10 grid border-b border-line bg-surface text-[12px] font-medium text-muted"
        style={{ gridTemplateColumns: cols }}
      >
        <div className="py-2 pl-8">Task name</div>
        {p.showAssignee && <div className="border-l border-line px-2 py-2">Assignee</div>}
        {p.showBrand && <div className="border-l border-line px-2 py-2">Brand</div>}
        <div className="border-l border-line px-2 py-2">Start</div>
        <div className="border-l border-line px-2 py-2">End</div>
        {seeAll && <div className="border-l border-line px-2 py-2">Due</div>}
        <div className="border-l border-line px-2 py-2">Priority</div>
        <div className="border-l border-line px-2 py-2">Status</div>
        <div className="border-l border-line px-2 py-2">{p.statusField === "scriptStage" ? "Script status" : "Edit status"}</div>
        <div className="border-l border-line px-2 py-2">Rev</div>
      </div>

      {p.groups.map((g) => {
        const isCollapsed = collapsed[g.key];
        // Only show top-level tasks at first level; subtasks render indented under parents
        const topLevelTasks = g.tasks.filter((t) => !t.parentId);

        return (
          <section key={g.key} className="mb-2">
            {p.groups.length > 1 || g.label ? (
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                className="flex w-full items-center gap-1.5 px-1 pb-1.5 pt-4 text-left text-[14px] font-semibold"
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                {g.color && <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: g.color }} />}
                {g.label}
                <span className="ml-1 text-[12px] font-normal text-muted">{topLevelTasks.length}</span>
              </button>
            ) : null}

            {!isCollapsed &&
              topLevelTasks.map((t) => {
                const done = isDone(t);
                const subtasks = getSubtasksFor(t.id);
                const isSubExpanded = expandedSubtasks[t.id];
                const currentBoardStatus = boardColumn(t);

                return (
                  <div key={t.id}>
                    {/* Parent task row */}
                    <div
                      onClick={() => p.onOpen(t.id)}
                      className={cn(
                        "group grid cursor-pointer items-center border-b border-line/70 text-[13px] transition-colors hover:bg-canvas",
                        p.selectedId === t.id && "bg-accent-soft/60 hover:bg-accent-soft/60",
                      )}
                      style={{ gridTemplateColumns: cols }}
                    >
                      {/* Task Name cell */}
                      <div className="flex min-w-0 items-center gap-2 py-1.5 pl-8 pr-2">
                        <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border", done ? "border-emerald-500 bg-emerald-500" : "border-muted/50")} />
                        <span className="shrink-0 text-[11px] text-muted">{t.code}</span>
                        <span className={cn("truncate", done && "text-muted line-through decoration-muted/40")}>{t.title}</span>

                        {/* Subtasks expander badge */}
                        {(t.subtaskCount > 0 || subtasks.length > 0) && (
                          <button
                            type="button"
                            onClick={(e) => toggleSubtasks(t.id, e)}
                            className="inline-flex shrink-0 items-center gap-1 rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted hover:bg-surface hover:text-ink"
                            title="Expand subtasks"
                          >
                            ↳ {Math.max(t.subtaskCount, subtasks.length)}
                          </button>
                        )}

                        <DelayBadge t={t} />

                        {/* Inline On Hold button toggle */}
                        <OnHoldBadge
                          onHold={t.onHold}
                          canEdit={editable(t, "onHold")}
                          onClick={() => p.onUpdate(t.id, { onHold: false })}
                        />

                        {t.storageDeviceName && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-canvas px-1 py-0.5 text-[10px] text-muted" title={`Storage: ${t.storageDeviceName}`}>
                            <HardDrive className="h-2.5 w-2.5" />
                            {t.storageDeviceName}
                          </span>
                        )}

                        {t.commentCount > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted" title={`${t.commentCount} comment${t.commentCount === 1 ? "" : "s"}`}>
                            <MessageSquare className="h-3 w-3" />
                            {t.commentCount}
                          </span>
                        )}

                        {t.assigneeId !== p.viewer.id && t.collaboratorIds.includes(p.viewer.id) && (
                          <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">Collaborator</span>
                        )}
                      </div>

                      {/* Assignee */}
                      {p.showAssignee && (
                        <div className="flex min-w-0 items-center gap-1.5 px-1">
                          {t.assigneeName && <Avatar name={t.assigneeName} size={20} />}
                          <CellSelect
                            value={t.assigneeId ?? ""}
                            disabled={!editable(t, "assigneeId")}
                            options={[{ value: "", label: "Unassigned" }, ...p.people.filter((x) => x.active || x.id === t.assigneeId).map((x) => ({ value: x.id, label: x.name }))]}
                            onChange={(v) => p.onUpdate(t.id, { assigneeId: v || null })}
                          />
                        </div>
                      )}

                      {/* Brand */}
                      {p.showBrand && (
                        <div className="min-w-0 px-1">
                          {editable(t, "brandId") ? (
                            <CellSelect
                              value={t.brandId ?? ""}
                              options={[{ value: "", label: "No brand" }, ...p.brands.map((b) => ({ value: b.id, label: b.name }))]}
                              onChange={(v) => p.onUpdate(t.id, { brandId: v || null })}
                            />
                          ) : (
                            <div className="px-2"><BrandChip name={t.brandName} color={t.brandColor} /></div>
                          )}
                        </div>
                      )}

                      {/* Start Date */}
                      <div className="px-2"><DueText date={t.startDate} done={done} /></div>

                      {/* End Date */}
                      <div className="px-2"><DueText date={t.internalDeadline} done={done} /></div>

                      {/* Due Date (client) */}
                      {seeAll && <div className="px-2"><DueText date={t.externalDeadline} done={done} /></div>}

                      {/* Priority */}
                      <div className="px-1">
                        {editable(t, "priority") ? (
                          <CellSelect value={t.priority} options={opts(PRIORITIES)} onChange={(v) => p.onUpdate(t.id, { priority: v })} />
                        ) : (
                          <div className="px-2"><PriorityPill value={t.priority} /></div>
                        )}
                      </div>

                      {/* Direct Board Status selector (Mirrors the board 1:1) */}
                      <div className="min-w-0 px-1">
                        <CellSelect
                          value={currentBoardStatus}
                          disabled={!editable(t, "editStatus") && !editable(t, "onHold")}
                          options={BOARD_STATUS_OPTS}
                          onChange={(v) => {
                            const patch = boardStatusPatch(t, v as BoardKey);
                            p.onUpdate(t.id, patch);
                          }}
                        />
                      </div>

                      {/* Pipeline Status (Edit status or Script status) */}
                      <div className="min-w-0 px-1">
                        <CellSelect
                          value={t[p.statusField]}
                          disabled={!editable(t, p.statusField)}
                          options={opts(statusOptions)}
                          onChange={(v) => p.onUpdate(t.id, { [p.statusField]: v })}
                        />
                      </div>

                      {/* Revision Round */}
                      <div className="px-1">
                        <CellSelect
                          value={String(t.revisionRound)}
                          disabled={!editable(t, "revisionRound")}
                          options={opts(REVISION_ROUNDS)}
                          onChange={(v) => p.onUpdate(t.id, { revisionRound: Number(v) })}
                        />
                      </div>
                    </div>

                    {/* Indented Subtask rows (Asana style) */}
                    {isSubExpanded && subtasks.length > 0 && (
                      <div className="bg-canvas/40 pl-6 border-b border-line/40">
                        {subtasks.map((sub) => {
                          const subDone = isDone(sub);
                          const subBoardStatus = boardColumn(sub);

                          return (
                            <div
                              key={sub.id}
                              onClick={() => p.onOpen(sub.id)}
                              className={cn(
                                "group grid cursor-pointer items-center border-b border-line/30 py-1 text-[12px] transition-colors hover:bg-canvas",
                                p.selectedId === sub.id && "bg-accent-soft/60 hover:bg-accent-soft/60",
                              )}
                              style={{ gridTemplateColumns: cols }}
                            >
                              <div className="flex min-w-0 items-center gap-2 pl-4 pr-2">
                                <span className="text-muted">↳</span>
                                <span className={cn("h-3 w-3 shrink-0 rounded-full border", subDone ? "border-emerald-500 bg-emerald-500" : "border-muted/50")} />
                                <span className="shrink-0 text-[10px] text-muted">{sub.code}</span>
                                <span className={cn("truncate", subDone && "text-muted line-through")}>{sub.title}</span>
                              </div>

                              {p.showAssignee && (
                                <div className="flex min-w-0 items-center gap-1.5 px-1">
                                  {sub.assigneeName && <Avatar name={sub.assigneeName} size={18} />}
                                  <CellSelect
                                    value={sub.assigneeId ?? ""}
                                    disabled={!editable(sub, "assigneeId")}
                                    options={[{ value: "", label: "Unassigned" }, ...p.people.filter((x) => x.active || x.id === sub.assigneeId).map((x) => ({ value: x.id, label: x.name }))]}
                                    onChange={(v) => p.onUpdate(sub.id, { assigneeId: v || null })}
                                  />
                                </div>
                              )}

                              {p.showBrand && <div className="px-2 text-muted text-[11px]">—</div>}
                              <div className="px-2"><DueText date={sub.startDate} done={subDone} /></div>
                              <div className="px-2"><DueText date={sub.internalDeadline} done={subDone} /></div>
                              {seeAll && <div className="px-2"><DueText date={sub.externalDeadline} done={subDone} /></div>}
                              <div className="px-1"><PriorityPill value={sub.priority} /></div>
                              <div className="min-w-0 px-1">
                                <CellSelect
                                  value={subBoardStatus}
                                  disabled={!editable(sub, "editStatus")}
                                  options={BOARD_STATUS_OPTS}
                                  onChange={(v) => p.onUpdate(sub.id, boardStatusPatch(sub, v as BoardKey))}
                                />
                              </div>
                              <div className="min-w-0 px-1 text-muted text-[11px]">{sub[p.statusField]}</div>
                              <div className="px-1 text-muted text-[11px]">{sub.revisionRound > 0 ? `R${sub.revisionRound}` : "—"}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            {!isCollapsed && topLevelTasks.length === 0 && <div className="py-2 pl-8 text-[12px] text-muted">No tasks</div>}
          </section>
        );
      })}
    </div>
  );
}
