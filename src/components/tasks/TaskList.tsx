"use client";

import { Check, CheckSquare, ChevronDown, ChevronRight, MessageSquare, Paperclip, Plus } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import type { BrandDTO, PersonDTO, TaskDTO } from "@/lib/dto";
import { dropPatch } from "@/lib/board";
import { isDone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { canEditField } from "@/lib/rbac";
import { CellSelect, DelayBadge, DueText, StatusSelect } from "./bits";
import { JiraEpicPill, JiraIssueKey, JiraIssueTypeIcon, JiraPriorityIcon, JiraStatusLozenge } from "../jira/JiraBits";

export type Group = { key: string; label: string; color?: string; tasks: TaskDTO[] };

type Props = {
  groups: Group[];
  people: PersonDTO[];
  brands: BrandDTO[];
  viewer: { id: string; role: string; seeAll: boolean };
  showAssignee: boolean;
  showBrand: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onQuickAdd?: (groupKey: string, title: string) => Promise<void>;
};

export function QuickAddRow({
  onAdd,
  className,
  placeholder = "+ Create issue",
}: {
  onAdd: (title: string) => Promise<void>;
  className?: string;
  placeholder?: string;
}) {
  const [active, setActive] = useState(false);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className={cn(
          "flex w-full items-center gap-2 py-2 pl-4 text-left text-[12px] font-semibold text-muted hover:bg-canvas hover:text-[#0052CC] transition",
          className
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        <span>{placeholder}</span>
      </button>
    );
  }

  return (
    <form
      className={cn("flex items-center gap-2 py-1.5 pl-4 pr-3 bg-canvas/60 border-b border-line", className)}
      onSubmit={async (e) => {
        e.preventDefault();
        const t = v.trim();
        if (!t || busy) return;
        setBusy(true);
        try {
          await onAdd(t);
          setV("");
          setActive(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setActive(false)}
        placeholder="What needs to be done?"
        className="flex-1 bg-surface border border-line rounded px-2.5 py-1 text-[13px] text-ink outline-none focus:border-[#0052CC]"
      />
      <button
        type="submit"
        disabled={busy || !v.trim()}
        className="jira-btn-primary px-3 py-1 text-[12px]"
      >
        {busy ? "Adding..." : "Add"}
      </button>
      <button
        type="button"
        onClick={() => setActive(false)}
        className="jira-btn-subtle px-2 py-1 text-[12px]"
      >
        Cancel
      </button>
    </form>
  );
}

// Jira List / Spreadsheet View: Type · Key · Summary · Status · Epic · Assignee · Due Date · Priority
export default function TaskList(p: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showEmptyStages, setShowEmptyStages] = useState(false);

  const emptyGroupsCount = p.groups.filter((g) => g.tasks.length === 0).length;
  const visibleGroups = p.groups.filter((g) => showEmptyStages || g.tasks.length > 0 || p.groups.length === 1);

  const cols = [
    "90px",                   // Key + Type
    "minmax(280px, 1.5fr)",   // Summary
    "150px",                  // Status lozenge
    "130px",                  // Campaign / Epic
    "110px",                  // Due date
    p.showAssignee ? "150px" : null, // Assignee
    "60px",                   // Priority
  ].filter(Boolean).join(" ");

  const editable = (t: TaskDTO, field: string) => canEditField(p.viewer, field, t);

  return (
    <div className="min-w-[760px] select-none">
      {/* Jira List Header */}
      <div
        className="sticky top-0 z-10 grid border-b border-line bg-canvas text-[11px] font-bold uppercase tracking-wider text-muted select-none"
        style={{ gridTemplateColumns: cols }}
      >
        <div className="py-2.5 pl-4">Key</div>
        <div className="border-l border-line/60 px-3 py-2.5">Summary</div>
        <div className="border-l border-line/60 px-3 py-2.5">Status</div>
        <div className="border-l border-line/60 px-3 py-2.5">Campaign</div>
        <div className="border-l border-line/60 px-3 py-2.5">Due date</div>
        {p.showAssignee && <div className="border-l border-line/60 px-3 py-2.5">Assignee</div>}
        <div className="border-l border-line/60 px-3 py-2.5 text-center">Prio</div>
      </div>

      {visibleGroups.map((g) => {
        const isCollapsed = collapsed[g.key] ?? (g.tasks.length === 0);
        return (
          <section key={g.key} className="mb-2">
            {p.groups.length > 1 || g.label ? (
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}
                className={cn(
                  "flex w-full items-center gap-2 px-3 pb-2 pt-3 text-left text-[12px] font-bold uppercase tracking-wider transition",
                  g.tasks.length === 0 ? "text-muted/60 hover:text-muted" : "text-muted hover:text-ink"
                )}
              >
                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
                {g.color && <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />}
                <span>{g.label}</span>
                <span className={cn(
                  "rounded-[3px] border px-1.5 py-0.2 font-mono text-[10px]",
                  g.tasks.length === 0 ? "bg-canvas/40 border-line/50 text-muted/50" : "bg-canvas border-line text-muted"
                )}>
                  {g.tasks.length}
                </span>
              </button>
            ) : null}

            {!isCollapsed && (
              <div className="divide-y divide-line/60 border-b border-line/80">
                {g.tasks.map((t) => {
                  const done = isDone(t);
                  return (
                    <div
                      key={t.id}
                      onClick={() => p.onOpen(t.id)}
                      className={cn(
                        "group grid cursor-pointer items-center text-[13px] transition-colors hover:bg-canvas/80",
                        p.selectedId === t.id && "bg-[#DEEBFF]/40 hover:bg-[#DEEBFF]/50 border-l-2 border-[#0052CC]",
                      )}
                      style={{ gridTemplateColumns: cols }}
                    >
                      {/* Key & Issue Type */}
                      <div className="flex items-center gap-2 py-2 pl-4">
                        <JiraIssueTypeIcon type={t.type || t.workType} />
                        <JiraIssueKey code={t.code} />
                      </div>

                      {/* Summary */}
                      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                        <span className={cn("truncate font-medium text-ink", done && "text-muted line-through")}>
                          {t.title}
                        </span>
                        <DelayBadge t={t} />
                        {t.subtaskCount > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted">
                            <CheckSquare className="h-3 w-3" />
                            {t.subtaskDone}/{t.subtaskCount}
                          </span>
                        )}
                        {t.commentCount > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted">
                            <MessageSquare className="h-3 w-3" />
                            {t.commentCount}
                          </span>
                        )}
                      </div>

                      {/* Status */}
                      <div className="px-3 py-1.5 min-w-0">
                        <StatusSelect t={t} disabled={!editable(t, "editStatus")} onUpdate={p.onUpdate} />
                      </div>

                      {/* Campaign / Epic */}
                      <div className="px-3 py-1.5 truncate">
                        {t.campaignName ? (
                          <JiraEpicPill name={t.campaignName} color={t.brandColor} />
                        ) : (
                          <span className="text-[11px] text-muted">—</span>
                        )}
                      </div>

                      {/* Due Date */}
                      <div className="px-3 py-1.5">
                        <DueText date={t.internalDeadline} done={done} />
                      </div>

                      {/* Assignee */}
                      {p.showAssignee && (
                        <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                          {t.assigneeName ? (
                            <Avatar name={t.assigneeName} size={20} />
                          ) : (
                            <span className="h-5 w-5 rounded-full border border-dashed border-muted/50 text-[10px] text-muted flex items-center justify-center">
                              ?
                            </span>
                          )}
                          <CellSelect
                            value={t.assigneeId ?? ""}
                            disabled={!editable(t, "assigneeId")}
                            options={[
                              { value: "", label: "Unassigned" },
                              ...p.people.filter((x) => x.active || x.id === t.assigneeId).map((x) => ({ value: x.id, label: x.name })),
                            ]}
                            onChange={(v) => p.onUpdate(t.id, { assigneeId: v || null })}
                          />
                        </div>
                      )}

                      {/* Priority */}
                      <div className="flex items-center justify-center px-3 py-1.5">
                        <JiraPriorityIcon priority={t.priority} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isCollapsed && p.onQuickAdd && (g.tasks.length > 0 || showEmptyStages) && (
              <QuickAddRow onAdd={(title) => p.onQuickAdd!(g.key, title)} />
            )}
          </section>
        );
      })}

      {/* Empty Groups Toggle Pill */}
      {emptyGroupsCount > 0 && (
        <div className="pt-3 pb-6 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setShowEmptyStages((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium text-muted hover:text-ink hover:border-slate-400 transition shadow-2xs"
          >
            {showEmptyStages ? (
              <span>Hide {emptyGroupsCount} empty stages</span>
            ) : (
              <span>+ Show {emptyGroupsCount} empty stages</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
