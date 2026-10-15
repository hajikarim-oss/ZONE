"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import type { BrandDTO, PersonDTO, TaskDTO } from "@/lib/dto";
import { EDIT_STATUSES, PRIORITIES, REVISION_ROUNDS, SCRIPT_STAGES } from "@/lib/constants";
import { isDone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { canEditField } from "@/lib/rbac";
import { BrandChip, CellSelect, DelayBadge, DueText, opts, PriorityPill, StagePill } from "./bits";

export type Group = { key: string; label: string; color?: string; tasks: TaskDTO[] };

type Props = {
  groups: Group[];
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

// Asana-style list: one quiet row per task, inline dropdowns, collapsible
// sections. Grid template keeps columns aligned across sections.
export default function TaskList(p: Props) {
  const seeAll = p.viewer.seeAll;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const cols = [
    "minmax(280px,1fr)",
    p.showAssignee ? "150px" : null,
    p.showBrand ? "130px" : null,
    "96px",
    seeAll ? "96px" : null,
    "96px",
    "150px",
    "170px",
    "64px",
  ].filter(Boolean).join(" ");

  const editable = (t: TaskDTO, field: string) => canEditField(p.viewer, field, t);

  const statusOptions = p.statusField === "scriptStage" ? SCRIPT_STAGES : EDIT_STATUSES;

  return (
    <div className="min-w-[1000px]">
      {/* header */}
      <div
        className="sticky top-0 z-10 grid border-b border-line bg-surface text-[12px] font-medium text-muted"
        style={{ gridTemplateColumns: cols }}
      >
        <div className="py-2 pl-8">Task name</div>
        {p.showAssignee && <div className="border-l border-line px-2 py-2">Assignee</div>}
        {p.showBrand && <div className="border-l border-line px-2 py-2">Brand</div>}
        <div className="border-l border-line px-2 py-2">Due</div>
        {seeAll && <div className="border-l border-line px-2 py-2">Client due</div>}
        <div className="border-l border-line px-2 py-2">Priority</div>
        <div className="border-l border-line px-2 py-2">Stage</div>
        <div className="border-l border-line px-2 py-2">{p.statusField === "scriptStage" ? "Script status" : "Edit status"}</div>
        <div className="border-l border-line px-2 py-2">Rev</div>
      </div>

      {p.groups.map((g) => {
        const isCollapsed = collapsed[g.key];
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
                <span className="ml-1 text-[12px] font-normal text-muted">{g.tasks.length}</span>
              </button>
            ) : null}

            {!isCollapsed &&
              g.tasks.map((t) => {
                const done = isDone(t);
                return (
                  <div
                    key={t.id}
                    onClick={() => p.onOpen(t.id)}
                    className={cn(
                      "group grid cursor-pointer items-center border-b border-line/70 text-[13px] transition-colors hover:bg-canvas",
                      p.selectedId === t.id && "bg-accent-soft/60 hover:bg-accent-soft/60",
                    )}
                    style={{ gridTemplateColumns: cols }}
                  >
                    <div className="flex min-w-0 items-center gap-2 py-1.5 pl-8 pr-2">
                      <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border", done ? "border-emerald-500 bg-emerald-500" : "border-muted/50")} />
                      <span className="shrink-0 text-[11px] text-muted">{t.code}</span>
                      <span className={cn("truncate", done && "text-muted line-through decoration-muted/40")}>{t.title}</span>
                      <DelayBadge t={t} />
                      {t.assigneeId !== p.viewer.id && t.collaboratorIds.includes(p.viewer.id) && (
                        <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">Collaborator</span>
                      )}
                    </div>
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
                    <div className="px-2"><DueText date={t.internalDeadline} done={done} /></div>
                    {seeAll && <div className="px-2"><DueText date={t.externalDeadline} done={done} /></div>}
                    <div className="px-1">
                      {editable(t, "priority") ? (
                        <CellSelect value={t.priority} options={opts(PRIORITIES)} onChange={(v) => p.onUpdate(t.id, { priority: v })} />
                      ) : (
                        <div className="px-2"><PriorityPill value={t.priority} /></div>
                      )}
                    </div>
                    <div className="min-w-0 px-2"><StagePill t={t} /></div>
                    <div className="min-w-0 px-1">
                      <CellSelect
                        value={t[p.statusField]}
                        disabled={!editable(t, p.statusField)}
                        options={opts(statusOptions)}
                        onChange={(v) => p.onUpdate(t.id, { [p.statusField]: v })}
                      />
                    </div>
                    <div className="px-1">
                      <CellSelect
                        value={String(t.revisionRound)}
                        disabled={!editable(t, "revisionRound")}
                        options={opts(REVISION_ROUNDS)}
                        onChange={(v) => p.onUpdate(t.id, { revisionRound: Number(v) })}
                      />
                    </div>
                  </div>
                );
              })}
            {!isCollapsed && g.tasks.length === 0 && <div className="py-2 pl-8 text-[12px] text-muted">No tasks</div>}
          </section>
        );
      })}
    </div>
  );
}
