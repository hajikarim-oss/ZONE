"use client";

import { CheckSquare, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import type { TaskDTO } from "@/lib/dto";
import { BOARD_COLUMNS, boardColumn, type BoardKey } from "@/lib/status";
import { cn } from "@/lib/utils";
import { BrandChip, DelayBadge, DueText } from "./bits";
import { JiraEpicPill, JiraIssueKey, JiraIssueTypeIcon, JiraPriorityIcon } from "../jira/JiraBits";

export { dropPatch } from "@/lib/board";

export default function TaskBoard({
  tasks,
  selectedId,
  showAssignee,
  onOpen,
  onMove,
  onQuickAdd,
}: {
  tasks: TaskDTO[];
  selectedId: string | null;
  showAssignee: boolean;
  onOpen: (id: string) => void;
  onMove: (task: TaskDTO, to: BoardKey) => void;
  onQuickAdd?: (col: string, title: string) => Promise<void>;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<BoardKey | null>(null);
  const [addingInCol, setAddingInCol] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleQuickSubmit(colKey: string, e: React.FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim() || !onQuickAdd || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onQuickAdd(colKey, quickTitle.trim());
      setQuickTitle("");
      setAddingInCol(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex h-full gap-3 pb-4 overflow-x-auto select-none">
      {BOARD_COLUMNS.map((col) => {
        const items = tasks.filter((t) => boardColumn(t) === col.key);
        const isTarget = over === col.key;

        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const t = tasks.find((x) => x.id === dragId);
              setDragId(null);
              setOver(null);
              if (t) onMove(t, col.key);
            }}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-[3px] bg-canvas border border-line/60 transition-colors",
              isTarget && "bg-[#DEEBFF]/30 border-[#0052CC] ring-2 ring-[#0052CC]/30",
            )}
          >
            {/* Jira Column Header */}
            <div className="flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                <span>{col.label}</span>
              </div>
              <span className="rounded-[3px] bg-side-hover px-1.5 py-0.2 font-mono text-[10px] text-ink font-bold">
                {items.length}
              </span>
            </div>

            {/* Jira Cards List */}
            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {items.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(t.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onClick={() => onOpen(t.id)}
                  className={cn(
                    "group relative block w-full cursor-grab rounded-[3px] border bg-surface p-3 text-left shadow-xs transition hover:border-[#4C9AFF] hover:shadow-sm active:cursor-grabbing",
                    selectedId === t.id ? "border-[#0052CC] ring-2 ring-[#0052CC]/20" : "border-line",
                    dragId === t.id && "opacity-40",
                  )}
                >
                  {/* Top row: Campaign / Epic Pill */}
                  {t.campaignName && (
                    <div className="mb-1.5">
                      <JiraEpicPill name={t.campaignName} color={t.brandColor} />
                    </div>
                  )}

                  {/* Summary / Title */}
                  <div className="text-[13px] font-medium leading-snug text-ink group-hover:text-[#0052CC] transition-colors">
                    {t.title}
                  </div>

                  {/* Delay / Late Warning */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <DelayBadge t={t} />
                  </div>

                  {/* Bottom Jira Metadata Row */}
                  <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2 text-[11px] text-muted">
                    {/* Left: Issue Type + Key */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <JiraIssueTypeIcon type={t.type || t.workType} />
                      <JiraIssueKey code={t.code} />
                    </div>

                    {/* Right: Priority, Subtasks, Assignee */}
                    <div className="flex items-center gap-2">
                      {t.subtaskCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px]" title="Subtasks completed">
                          <CheckSquare className="h-3 w-3" />
                          {t.subtaskDone}/{t.subtaskCount}
                        </span>
                      )}
                      {t.commentCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px]" title="Comments">
                          <MessageSquare className="h-3 w-3" />
                          {t.commentCount}
                        </span>
                      )}
                      <JiraPriorityIcon priority={t.priority} />
                      {showAssignee && (
                        t.assigneeName ? (
                          <span title={t.assigneeName} className="ring-1 ring-surface rounded-full">
                            <Avatar name={t.assigneeName} size={20} />
                          </span>
                        ) : (
                          <span className="h-5 w-5 rounded-full border border-dashed border-muted/60 flex items-center justify-center text-[9px] text-muted" title="Unassigned">
                            ?
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {items.length === 0 && dragId && (
                <div className="rounded-[3px] border border-dashed border-[#0052CC]/50 bg-[#DEEBFF]/20 px-3 py-8 text-center text-[12px] font-medium text-[#0052CC]">
                  Drop issue here
                </div>
              )}

              {/* Jira Quick Create Row */}
              {onQuickAdd && (
                addingInCol === col.key ? (
                  <form onSubmit={(e) => handleQuickSubmit(col.key, e)} className="rounded-[3px] border border-[#0052CC] bg-surface p-2 shadow-sm space-y-2">
                    <textarea
                      autoFocus
                      rows={2}
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleQuickSubmit(col.key, e);
                        }
                        if (e.key === "Escape") setAddingInCol(null);
                      }}
                      placeholder="What needs to be done?"
                      className="w-full resize-none text-[12px] font-medium text-ink outline-none"
                    />
                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setAddingInCol(null)}
                        className="jira-btn-subtle px-2 py-0.5 text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !quickTitle.trim()}
                        className="jira-btn-primary px-3 py-0.5 text-[11px] font-bold"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingInCol(col.key);
                      setQuickTitle("");
                    }}
                    className="flex w-full items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-surface hover:text-ink transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create issue</span>
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
